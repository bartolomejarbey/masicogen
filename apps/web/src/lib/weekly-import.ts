import {
  czechHolidayName,
  type MenuExtractionResult,
  type WeekDayOfWeek
} from "@masico/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractWeekMenuWithOpenAI } from "./openai";
import { buildHolidayDeck } from "./autopilot";

const WEEK_DAY_ORDER: WeekDayOfWeek[] = ["PO", "UT", "ST", "CT", "PA"];
const SIGNED_SOURCE_URL_SECONDS = 15 * 60;

/** Normalizace id sekcí z extrakce na klíče denní smyčky. */
const SECTION_ID_ALIASES: Record<string, string> = {
  soups: "soups",
  soup: "soups",
  polevky: "soups",
  polevka: "soups",
  mains: "mains",
  main: "mains",
  "hlavni-jidla": "mains",
  pizza: "pizza",
  buffet: "buffet",
  bufet: "buffet",
  "teply-bufet": "buffet",
  special: "special",
  specials: "special",
  specialy: "special",
  desserts: "special",
  dezerty: "special"
};

export class WeekImportError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export type WeekImportDayStatus = "imported" | "holiday" | "empty";

export type WeekImportDay = {
  menuDate: string;
  dayOfWeek: WeekDayOfWeek;
  status: WeekImportDayStatus;
  menuVersionId?: string;
  holidayLabel?: string;
  warnings: string[];
};

export type WeekImportResult = {
  weekStart: string;
  days: WeekImportDay[];
  enqueuedPhotos: number;
};

type PreparedDay = WeekImportDay & {
  snapshot?: MenuExtractionResult;
};

type ImportWeekRpcRow = {
  menu_date: string;
  menu_id: string;
  menu_version_id: string;
};

export type WeekImportInput = {
  access: { orgId: string };
  /** Uživatelský klient — import_week_from_source vyžaduje auth.uid(). */
  supabase: SupabaseClient;
  /** Service role — čtení zdrojového souboru ze storage. */
  admin: SupabaseClient;
  locationId: string;
  canteenId: string;
  weekStart: string;
  sourceBucket: string;
  sourcePath: string;
  sourceMime: string;
};

/**
 * Týdenní autopilot: nahraný lístek → extrakce PO–PÁ → atomický zápis draftů
 * přes import_week_from_source → fronta AI fotek. Datumy dnů se počítají
 * VÝHRADNĚ tady z weekStart (PO=0 … PÁ=4), nikdy z výstupu LLM. Svátky se
 * kontrolují dvojitě — při neshodě vyhrává český kalendář.
 */
export async function importWeekFromUpload(input: WeekImportInput): Promise<WeekImportResult> {
  const extraction = await extractWeek(input);

  // Dny se párují VÝHRADNĚ podle dayOfWeek — poziční fallback by při
  // duplicitním/chybějícím dni z LLM tiše přiřadil cizí menu (a alergeny!)
  // jinému dni. Duplicitní den = nedůvěryhodná extrakce → den vedeme prázdný.
  const dayCounts = new Map<string, number>();
  for (const day of extraction.days) {
    dayCounts.set(day.dayOfWeek, (dayCounts.get(day.dayOfWeek) ?? 0) + 1);
  }

  const prepared: PreparedDay[] = WEEK_DAY_ORDER.map((dayOfWeek, index) => {
    const menuDate = addDaysIso(input.weekStart, index);
    const duplicated = (dayCounts.get(dayOfWeek) ?? 0) > 1;
    const extracted = duplicated
      ? null
      : (extraction.days.find((day) => day.dayOfWeek === dayOfWeek) ?? null);
    const warnings = [...(extracted?.warnings ?? [])];

    if (duplicated) {
      warnings.push(
        `Lístek jsme přečetli nejednoznačně (den ${dayOfWeek} se v extrakci opakuje) — den necháváme prázdný, doplňte ho ručně.`
      );
    } else if (!extracted) {
      warnings.push(`Den ${dayOfWeek} se z lístku nepodařilo přečíst — doplňte ho ručně.`);
    }

    const calendarHoliday = czechHolidayName(menuDate);
    const llmHoliday = extracted?.isHoliday ?? false;

    if (calendarHoliday && !llmHoliday) {
      warnings.push(
        `Kalendář hlásí státní svátek (${calendarHoliday}), lístek den jako svátek neoznačuje — den vedeme podle kalendáře jako svátek.`
      );
    }
    if (!calendarHoliday && llmHoliday) {
      warnings.push(
        `Lístek označuje den jako svátek${extracted?.holidayLabel ? ` (${extracted.holidayLabel})` : ""}, ale český kalendář žádný svátek nezná — věříme kalendáři a den vedeme jako běžný.`
      );
    }

    // Rozhodující je kalendář: czechHolidayName ≠ null ⇒ svátek. I svátek
    // dostane menu verzi (syntetickou) — bez ní by nešel postavit sváteční
    // deck a TV by v den svátku držela včerejší ceny.
    if (calendarHoliday) {
      return {
        menuDate,
        dayOfWeek,
        status: "holiday" as const,
        holidayLabel: calendarHoliday,
        warnings,
        snapshot: holidaySnapshot(menuDate, calendarHoliday)
      };
    }

    const menu = extracted?.menu ?? null;
    const itemCount =
      menu?.sections.reduce((total, section) => total + section.items.length, 0) ?? 0;

    if (!menu || itemCount === 0) {
      return { menuDate, dayOfWeek, status: "empty" as const, warnings };
    }

    return {
      menuDate,
      dayOfWeek,
      status: "imported" as const,
      warnings,
      snapshot: normalizeExtractedMenu(menu, menuDate)
    };
  });

  const importableDays = prepared.filter((day) => day.snapshot);
  let enqueuedPhotos = 0;

  if (importableDays.length > 0) {
    const imported = await input.supabase.rpc("import_week_from_source", {
      target_org_id: input.access.orgId,
      target_location_id: input.locationId,
      target_canteen_id: input.canteenId,
      week_start: input.weekStart,
      source_bucket: input.sourceBucket,
      source_path: input.sourcePath,
      source_mime: input.sourceMime,
      days: importableDays.map((day) => ({
        menuDate: day.menuDate,
        extractionSnapshot: day.snapshot
      }))
    });

    if (imported.error) {
      throw new WeekImportError(
        "week_import_rpc_failed",
        `Uložení týdenního menu selhalo: ${imported.error.message}`,
        rpcStatus(imported.error)
      );
    }

    const rows = (imported.data as ImportWeekRpcRow[] | null) ?? [];
    if (rows.length !== importableDays.length) {
      throw new WeekImportError(
        "week_import_missing_result",
        "Uložení týdenního menu nevrátilo všechny dny.",
        500
      );
    }

    for (const row of rows) {
      const day = prepared.find((candidate) => candidate.menuDate === row.menu_date);
      if (day) {
        day.menuVersionId = row.menu_version_id;
      }
    }

    // Fronta AI fotek per den — její selhání import nesmí shodit. Sváteční
    // dny se přeskakují (syntetická položka žádnou fotku nepotřebuje).
    for (const row of rows) {
      const day = prepared.find((candidate) => candidate.menuDate === row.menu_date);
      if (day?.status === "holiday") {
        continue;
      }

      const enqueued = await input.supabase.rpc("enqueue_missing_dish_photos", {
        target_org_id: input.access.orgId,
        target_menu_version_id: row.menu_version_id
      });

      if (enqueued.error) {
        day?.warnings.push("Fotky jídel se nepodařilo zařadit do fronty — doplníte je ručně.");
        continue;
      }

      enqueuedPhotos += (enqueued.data as number | null) ?? 0;
    }

    // Sváteční dny: schválit syntetické menu a rovnou postavit sváteční deck,
    // ať si ho TV v den D sama publikuje. Selhání nesmí shodit import.
    for (const day of prepared) {
      if (day.status !== "holiday" || !day.menuVersionId || !day.holidayLabel) {
        continue;
      }

      try {
        const approved = await input.supabase.rpc("approve_menu_version", {
          target_menu_version_id: day.menuVersionId,
          approval_comment: `Státní svátek: ${day.holidayLabel}.`
        });

        // 23514 = už schváleno (opakovaný import) — pokračujeme stavbou decku.
        if (approved.error && approved.error.code !== "23514") {
          throw new Error(approved.error.message);
        }

        await buildHolidayDeck(input.supabase, {
          orgId: input.access.orgId,
          locationId: input.locationId,
          canteenId: input.canteenId,
          menuVersionId: day.menuVersionId,
          holidayLabel: day.holidayLabel,
          menuDate: day.menuDate
        });
      } catch (error) {
        day.warnings.push(
          `Sváteční oznámení se nepodařilo připravit (${error instanceof Error ? error.message : "chyba"}) — TV v ten den zobrazí banner se starším menu.`
        );
      }
    }
  }

  return {
    weekStart: input.weekStart,
    // Snapshot je jen interní mezikrok — do odpovědi nepatří (velikost).
    days: prepared.map((day) => ({
      menuDate: day.menuDate,
      dayOfWeek: day.dayOfWeek,
      status: day.status,
      ...(day.menuVersionId ? { menuVersionId: day.menuVersionId } : {}),
      ...(day.holidayLabel ? { holidayLabel: day.holidayLabel } : {}),
      warnings: day.warnings
    })),
    enqueuedPhotos
  };
}

/** Zdrojový soubor: obrázek → signed URL, PDF → base64; pak extrakce LLM. */
async function extractWeek(input: WeekImportInput) {
  let imageUrl: string | undefined;
  let fileBase64: { data: string; mimeType: string } | undefined;

  if (input.sourceMime === "application/pdf") {
    const download = await input.admin.storage.from(input.sourceBucket).download(input.sourcePath);

    if (download.error || !download.data) {
      throw new WeekImportError(
        "week_source_unreadable",
        "Nahraný lístek se nepodařilo načíst z úložiště. Zkuste ho nahrát znovu.",
        502
      );
    }

    fileBase64 = {
      data: Buffer.from(await download.data.arrayBuffer()).toString("base64"),
      mimeType: input.sourceMime
    };
  } else {
    const signed = await input.admin.storage
      .from(input.sourceBucket)
      .createSignedUrl(input.sourcePath, SIGNED_SOURCE_URL_SECONDS);

    if (signed.error || !signed.data?.signedUrl) {
      throw new WeekImportError(
        "week_source_unreadable",
        "Nahraný lístek se nepodařilo načíst z úložiště. Zkuste ho nahrát znovu.",
        502
      );
    }

    imageUrl = signed.data.signedUrl;
  }

  try {
    return await extractWeekMenuWithOpenAI({
      imageUrl,
      fileBase64,
      weekStartHint: input.weekStart
    });
  } catch (error) {
    // Skutečná příčina (model, schéma, kvóta, síť) musí zůstat v logu —
    // uživateli patří srozumitelná hláška, provozu plný kontext.
    console.error("import-week: extrakce lístku selhala", error);
    throw new WeekImportError(
      "week_extraction_failed",
      "Jídelníček se z lístku nepodařilo přečíst. Zkuste ostřejší fotku celého lístku, nebo zadejte dny ručně.",
      502
    );
  }
}

/**
 * Snapshot dne pro uložení: doplněné datum, normalizovaná id sekcí a
 * deterministická id položek (item-{sekce}-{pořadí}) — RPC vyžaduje
 * unikátní kombinace a LLM by je negarantovalo.
 */
function normalizeExtractedMenu(menu: MenuExtractionResult, menuDate: string): MenuExtractionResult {
  return {
    ...menu,
    date: menuDate,
    sections: menu.sections.map((section, sectionIndex) => ({
      ...section,
      id: normalizeSectionId(section.id, sectionIndex),
      items: section.items.map((item, itemIndex) => ({
        ...item,
        id: `item-${sectionIndex}-${itemIndex}`
      }))
    }))
  };
}

function normalizeSectionId(rawId: string, sectionIndex: number): string {
  const key = rawId.trim().toLowerCase();
  if (SECTION_ID_ALIASES[key]) {
    return SECTION_ID_ALIASES[key];
  }

  // Neznámé id necháme být (deck-builder umí sekce dohledat i podle názvu),
  // prázdné nahradíme stabilním fallbackem.
  return key.length > 0 ? key : `section-${sectionIndex}`;
}

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function rpcStatus(error: { code?: string }) {
  switch (error.code) {
    case "28000":
      return 401;
    case "42501":
      return 403;
    case "P0002":
      return 404;
    case "23514":
    case "22023":
    case "23502":
      return 422;
    default:
      return 502;
  }
}

/**
 * Syntetické menu svátečního dne: nese jen název svátku, aby na něm mohl
 * viset sváteční deck (deck_versions vyžadují menu verzi). Na TV se z něj
 * nic nečte — holiday šablona zobrazuje slide.title.
 */
function holidaySnapshot(menuDate: string, holidayLabel: string): MenuExtractionResult {
  return {
    restaurant: { name: "MASI-CO food", locale: "cs-CZ", currency: "CZK" },
    date: menuDate,
    locationName: null,
    warnings: ["Státní svátek — automatické oznámení."],
    sections: [
      {
        id: "special",
        name: "Svátek",
        items: [
          {
            id: "holiday-1",
            name: holidayLabel,
            description: null,
            prices: [{ label: "", amount: 0, currency: "CZK" }],
            allergens: [],
            allergensUnknown: false,
            dietaryTags: [],
            modifiers: [],
            available: true,
            highlight: false,
            sourceRefs: [],
            confidence: 1
          }
        ]
      }
    ]
  };
}
