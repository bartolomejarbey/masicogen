import {
  auditDeck,
  buildDailyDeckManifest,
  dailyLoopTemplates,
  holidayNoticeTemplate,
  type AuditIssue,
  type DailyLoopSlideKey,
  type DeckManifest,
  type MenuExtractionResult,
  type TemplateManifestV2
} from "@masico/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadResolvedSettings } from "./settings-store";
import { loadTemplateOverrides } from "./template-store";

/**
 * Jediné audit kódy, které smí zablokovat schválení dne: chyby v datech menu.
 * date_mismatch sem nepatří — v týdenním flow se schvalují budoucí dny.
 * Vizuální nálezy provoz nikdy nezastaví (rozhodnutí 7 a 8 blueprintu).
 */
const BLOCKING_MENU_CODES = new Set(["missing_price", "missing_allergens"]);

export class AutopilotBlockedError extends Error {
  code = "autopilot_blocked" as const;
  status = 422 as const;
  issues: AuditIssue[];

  constructor(message: string, issues: AuditIssue[]) {
    super(message);
    this.issues = issues;
  }
}

export class AutopilotError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export type ApproveMenuAndBuildDeckInput = {
  orgId: string;
  locationId: string;
  canteenId: string;
  menuVersionId: string;
  /** Snapshot menu z menu_versions — zdroj pravdy pro stavbu decku. */
  menu: MenuExtractionResult;
  menuDate: string;
  slideDurationsSeconds?: Partial<Record<DailyLoopSlideKey, number>>;
  comment?: string;
};

export type ApproveMenuAndBuildDeckResult = {
  deckId: string;
  deckVersionId: string;
  audit: AuditIssue[];
  manifest: DeckManifest;
};

type DeckRpcRow = {
  org_id: string;
  deck_id: string;
  deck_version_id: string;
  menu_version_id: string;
  status: string;
};

/**
 * Jádro autopilota (rozhodnutí 6 a 7 blueprintu): člověk schválí MENU,
 * deck je jeho deterministická funkce — postaví a schválí se automaticky.
 * NIKDY nepublikuje; publikace zůstává výhradně pull-publish v den D.
 */
export async function approveMenuAndBuildDeck(
  supabase: SupabaseClient,
  input: ApproveMenuAndBuildDeckInput
): Promise<ApproveMenuAndBuildDeckResult> {
  const [settings, overrides] = await Promise.all([
    loadResolvedSettings(input.orgId),
    loadTemplateOverrides(input.orgId)
  ]);

  // Org přepisy šablon (jen v2, filtruje už loadTemplateOverrides) mají
  // přednost před vestavěnými — merge podle id šablony.
  const templates: TemplateManifestV2[] = dailyLoopTemplates.map(
    (template) => overrides.get(template.id)?.manifest ?? template
  );

  const menu: MenuExtractionResult = await attachDefaultDishPhotos(supabase, input.orgId, {
    ...input.menu,
    date: input.menu.date ?? input.menuDate
  });

  const manifest = buildDailyDeckManifest(menu, {
    orgId: input.orgId,
    locationId: input.locationId,
    canteenId: input.canteenId,
    menuVersionId: input.menuVersionId,
    slideDurationsSeconds: {
      ...settings.loop.durationsSeconds,
      ...input.slideDurationsSeconds
    },
    enabledSlides: settings.loop.enabledSlides,
    footerLegendText: settings.content.footerLegendText,
    templates
  });

  if (manifest.slides.length === 0) {
    throw new AutopilotBlockedError("Z menu nevznikl žádný slide.", [
      {
        severity: "error",
        code: "no_slides",
        message: "Z menu nevznikl žádný slide — doplňte alespoň polévky nebo hlavní jídla."
      }
    ]);
  }

  // Schvalujeme i budoucí dny, proto today: undefined — date_mismatch se tu
  // záměrně nekontroluje.
  const audit = auditDeck(manifest, menu, { today: undefined });
  const blocking = audit.filter(
    (issue) => issue.severity === "error" && BLOCKING_MENU_CODES.has(issue.code)
  );

  if (blocking.length > 0) {
    throw new AutopilotBlockedError(
      "Před schválením dne doplňte chybějící ceny nebo alergeny.",
      blocking
    );
  }

  const approvedMenu = await supabase.rpc("approve_menu_version", {
    target_menu_version_id: input.menuVersionId,
    approval_comment: input.comment ?? "Menu dne zkontrolováno a schváleno."
  });

  // 23514 = verze už je schválená (minulý pokus schválil menu, ale stavba
  // decku selhala) — pokračujeme, jinak by se den nedal nikdy dokončit.
  if (approvedMenu.error && approvedMenu.error.code !== "23514") {
    throw rpcFailure("autopilot_menu_approval_failed", "Schválení menu selhalo", approvedMenu.error);
  }

  const { deckId, deckVersionId } = await createApprovedDeck(
    supabase,
    input.menuVersionId,
    manifest,
    input.comment ?? "TV smyčka postavena automaticky ze schváleného menu."
  );

  return { deckId, deckVersionId, audit, manifest };
}

export type BuildHolidayDeckInput = {
  orgId: string;
  locationId: string;
  canteenId: string;
  menuVersionId: string;
  holidayLabel: string;
  menuDate: string;
};

/**
 * Sváteční deck: jediný slide „STÁTNÍ SVÁTEK“ (rozhodnutí 9 blueprintu) —
 * TV v den svátku nesmí držet včerejší ceny. Deck se schválí automaticky,
 * publikace opět jen přes pull-publish.
 */
export async function buildHolidayDeck(
  supabase: SupabaseClient,
  input: BuildHolidayDeckInput
): Promise<{ deckId: string; deckVersionId: string }> {
  const template = structuredClone(holidayNoticeTemplate);

  const manifest: DeckManifest = {
    id: "deck-holiday-preview",
    orgId: input.orgId,
    locationId: input.locationId,
    canteenId: input.canteenId,
    menuVersionId: input.menuVersionId,
    status: "draft",
    fps: 30,
    canvas: { width: 1920, height: 1080, aspectRatio: "16:9" },
    slides: [
      {
        id: "slide-holiday",
        templateId: template.id,
        // Binding {source:'menu', field:'title'} čte slide.title — sem patří
        // název svátku.
        title: input.holidayLabel,
        menuSectionIds: [],
        menuItemIds: [],
        backgroundAssetId: null,
        durationFrames: template.durationFrames,
        sortOrder: 1
      }
    ],
    templateVersionIds: [`${template.id}@current`],
    templateManifests: { [template.id]: template },
    assetIds: [],
    assetUrls: {},
    rendererVersion: "0.2.0"
  };

  return createApprovedDeck(
    supabase,
    input.menuVersionId,
    manifest,
    `Sváteční oznámení pro ${input.menuDate}: ${input.holidayLabel}.`
  );
}

async function createApprovedDeck(
  supabase: SupabaseClient,
  menuVersionId: string,
  manifest: DeckManifest,
  comment: string
): Promise<{ deckId: string; deckVersionId: string }> {
  const createdDeck = await supabase.rpc("create_tv_deck_from_manifest", {
    target_menu_version_id: menuVersionId,
    deck_manifest: manifest
  });

  if (createdDeck.error) {
    throw rpcFailure("autopilot_deck_create_failed", "Vytvoření TV smyčky selhalo", createdDeck.error);
  }

  const deckRow = (createdDeck.data as DeckRpcRow[] | null)?.[0];
  if (!deckRow) {
    throw new AutopilotError(
      "autopilot_deck_missing_result",
      "Vytvoření TV smyčky nevrátilo deck verzi.",
      500
    );
  }

  const approvedDeck = await supabase.rpc("approve_deck_version", {
    target_deck_version_id: deckRow.deck_version_id,
    approval_comment: comment
  });

  if (approvedDeck.error) {
    throw rpcFailure("autopilot_deck_approval_failed", "Schválení TV smyčky selhalo", approvedDeck.error);
  }

  return { deckId: deckRow.deck_id, deckVersionId: deckRow.deck_version_id };
}

function rpcFailure(code: string, title: string, error: { code?: string; message: string }) {
  return new AutopilotError(code, `${title}: ${error.message}`, rpcStatus(error));
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
      return 500;
  }
}

type DishPhotoDefaultRow = {
  asset_id: string;
  dish_name_normalized: string;
  focal_point: { x: number; y: number } | null;
  source: string;
};

/** Zrcadlí private.normalize_dish_name z SQL (malá písmena, bez diakritiky). */
function normalizeDishName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Autopilotí smyčka fotek: položkám bez fotky připne výchozí fotku
 * z knihovny (včetně AI vygenerovaných) podle normalizovaného názvu.
 * Bez toho by decky schválené na /tyden renderovaly jen placeholdery.
 */
async function attachDefaultDishPhotos(
  supabase: SupabaseClient,
  orgId: string,
  menu: MenuExtractionResult
): Promise<MenuExtractionResult> {
  const missing = new Map<string, string>();
  for (const section of menu.sections) {
    for (const item of section.items) {
      if (!item.photoAssetId && item.name.trim()) {
        missing.set(normalizeDishName(item.name), item.name);
      }
    }
  }

  if (missing.size === 0) {
    return menu;
  }

  // Fotky nikdy neblokují stavbu decku — jakákoli chyba (včetně chybějícího
  // storage klienta v testech) znamená stavět s placeholdery.
  let rows: DishPhotoDefaultRow[];
  try {
    const { data, error } = await supabase
      .from("dish_photos")
      .select("asset_id, dish_name_normalized, focal_point, source")
      .eq("org_id", orgId)
      .eq("is_default", true)
      .in("dish_name_normalized", Array.from(missing.keys()));

    if (error || !data || data.length === 0) {
      return menu;
    }
    rows = data as DishPhotoDefaultRow[];
  } catch {
    return menu;
  }

  const byName = new Map(rows.map((row) => [row.dish_name_normalized, row]));

  return {
    ...menu,
    sections: menu.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        if (item.photoAssetId) {
          return item;
        }
        const match = byName.get(normalizeDishName(item.name));
        if (!match) {
          return item;
        }
        return {
          ...item,
          photoAssetId: match.asset_id,
          photoFocalPoint: match.focal_point ?? undefined,
          photoSource:
            match.source === "ai" || match.source === "cutout" || match.source === "upload"
              ? match.source
              : undefined
        };
      })
    }))
  };
}
