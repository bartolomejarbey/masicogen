import {
  buildDailyDeckManifest,
  deckDurationSeconds,
  formatCzk,
  menuExtractionResultSchema,
  validateMenuForApproval,
  SLIDE_MAX_DURATION_SECONDS,
  SLIDE_MIN_DURATION_SECONDS,
  type MenuExtractionResult
} from "@masico/shared";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const slideDurationSchema = z
  .number()
  .int()
  .min(SLIDE_MIN_DURATION_SECONDS)
  .max(SLIDE_MAX_DURATION_SECONDS);

export const dayLaunchRequestSchema = z.object({
  locationId: z.string().uuid(),
  canteenId: z.string().uuid(),
  menuDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  menu: menuExtractionResultSchema,
  slideDurationsSeconds: z
    .object({
      intro: slideDurationSchema.optional(),
      soups: slideDurationSchema.optional(),
      mains: slideDurationSchema.optional(),
      pizza: slideDurationSchema.optional(),
      buffet: slideDurationSchema.optional(),
      special: slideDurationSchema.optional()
    })
    .optional(),
  screenId: z.string().uuid().optional(),
  publish: z.boolean().default(true),
  comment: z.string().trim().max(1000).optional()
});

export type DayLaunchRequest = z.infer<typeof dayLaunchRequestSchema>;

export class DayLaunchError extends Error {
  code: string;
  status: number;
  issues?: Array<{ code: string; message: string }>;

  constructor(
    code: string,
    message: string,
    status: number,
    issues?: Array<{ code: string; message: string }>
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.issues = issues;
  }
}

type RpcClient = SupabaseClient;

type ImportRow = {
  org_id: string;
  menu_id: string;
  menu_version_id: string;
  source_id: string;
  menu_date: string;
  status: string;
};

type DeckRow = {
  org_id: string;
  deck_id: string;
  deck_version_id: string;
  menu_version_id: string;
  status: string;
};

type PublishRow = {
  screen_id: string;
  deck_version_id: string;
  publish_event_id: string;
  screen_status: string;
  published_at: string;
};

export type DayLaunchResult = {
  menuVersionId: string;
  menuId: string;
  deckId: string;
  deckVersionId: string;
  itemCount: number;
  loopDurationSeconds: number;
  slideCount: number;
  published: {
    screenId: string;
    publishEventId: string;
    publishedAt: string;
  } | null;
};

export async function launchDayMenu(
  supabase: RpcClient,
  input: DayLaunchRequest & { orgId: string }
): Promise<DayLaunchResult> {
  const blockingIssues = validateMenuForApproval(input.menu).filter(
    (issue) => issue.severity === "error"
  );

  if (blockingIssues.length > 0) {
    throw new DayLaunchError(
      "day_menu_validation_failed",
      "Před uložením doplňte chybějící ceny nebo alergeny.",
      422,
      blockingIssues.map((issue) => ({ code: issue.code, message: issue.message }))
    );
  }

  const itemCount = input.menu.sections.reduce(
    (total, section) => total + section.items.length,
    0
  );

  if (itemCount === 0) {
    throw new DayLaunchError("day_menu_empty", "Menu neobsahuje žádnou položku.", 422);
  }

  const imported = await supabase.rpc("import_text_menu_version", {
    target_org_id: input.orgId,
    target_location_id: input.locationId,
    target_canteen_id: input.canteenId,
    target_menu_date: input.menuDate,
    source_text: menuToSourceText(input.menu),
    extraction_snapshot: input.menu
  });

  if (imported.error) {
    throw rpcFailure("day_menu_import_failed", "Uložení menu selhalo", imported.error);
  }

  const importResult = (imported.data as ImportRow[] | null)?.[0];
  if (!importResult) {
    throw new DayLaunchError(
      "day_menu_import_missing_result",
      "Import menu nevrátil uloženou verzi.",
      500
    );
  }

  const approvedMenu = await supabase.rpc("approve_menu_version", {
    target_menu_version_id: importResult.menu_version_id,
    approval_comment: input.comment ?? "Denní menu potvrzeno obsluhou."
  });

  if (approvedMenu.error) {
    throw rpcFailure("day_menu_approval_failed", "Schválení menu selhalo", approvedMenu.error);
  }

  const manifest = buildDailyDeckManifest(input.menu, {
    orgId: input.orgId,
    locationId: input.locationId,
    canteenId: input.canteenId,
    menuVersionId: importResult.menu_version_id,
    slideDurationsSeconds: input.slideDurationsSeconds
  });

  if (manifest.slides.length === 0) {
    throw new DayLaunchError(
      "day_menu_no_slides",
      "Z menu nevznikl žádný slide — doplňte alespoň polévky nebo hlavní jídla.",
      422
    );
  }

  const createdDeck = await supabase.rpc("create_tv_deck_from_manifest", {
    target_menu_version_id: importResult.menu_version_id,
    deck_manifest: manifest
  });

  if (createdDeck.error) {
    throw rpcFailure("day_deck_create_failed", "Vytvoření TV smyčky selhalo", createdDeck.error);
  }

  const deckResult = (createdDeck.data as DeckRow[] | null)?.[0];
  if (!deckResult) {
    throw new DayLaunchError(
      "day_deck_missing_result",
      "Vytvoření TV smyčky nevrátilo deck verzi.",
      500
    );
  }

  const approvedDeck = await supabase.rpc("approve_deck_version", {
    target_deck_version_id: deckResult.deck_version_id,
    approval_comment: input.comment ?? "TV smyčka potvrzena obsluhou."
  });

  if (approvedDeck.error) {
    throw rpcFailure("day_deck_approval_failed", "Schválení TV smyčky selhalo", approvedDeck.error);
  }

  let published: DayLaunchResult["published"] = null;

  if (input.publish) {
    if (!input.screenId) {
      throw new DayLaunchError(
        "day_publish_missing_screen",
        "Pro spuštění na TV vyberte obrazovku.",
        422
      );
    }

    const publishedRpc = await supabase.rpc("publish_live_deck_to_screen", {
      target_screen_id: input.screenId,
      target_deck_version_id: deckResult.deck_version_id,
      publish_comment: input.comment ?? "Denní menu: live publish."
    });

    if (publishedRpc.error) {
      throw rpcFailure("day_publish_failed", "Publikace na TV selhala", publishedRpc.error);
    }

    const publishResult = (publishedRpc.data as PublishRow[] | null)?.[0];
    if (!publishResult) {
      throw new DayLaunchError(
        "day_publish_missing_result",
        "Publikace nevrátila publish event.",
        500
      );
    }

    published = {
      screenId: publishResult.screen_id,
      publishEventId: publishResult.publish_event_id,
      publishedAt: publishResult.published_at
    };
  }

  return {
    menuVersionId: importResult.menu_version_id,
    menuId: importResult.menu_id,
    deckId: deckResult.deck_id,
    deckVersionId: deckResult.deck_version_id,
    itemCount,
    loopDurationSeconds: Math.round(deckDurationSeconds(manifest)),
    slideCount: manifest.slides.length,
    published
  };
}

/**
 * Import RPC ukládá zdrojový text do menu_sources; pro strukturovaný formulář
 * ho sestavíme z menu, aby audit stopa zůstala čitelná.
 */
export function menuToSourceText(menu: MenuExtractionResult) {
  const lines: string[] = [];

  for (const section of menu.sections) {
    lines.push(section.name);
    for (const item of section.items) {
      const price = item.prices[0]?.amount;
      const parts = [item.name];
      if (price !== null && price !== undefined) {
        parts.push(formatCzk(price));
      }
      if (item.allergens.length > 0) {
        parts.push(`alergeny ${item.allergens.join(", ")}`);
      }
      lines.push(parts.join(" "));
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

function rpcFailure(code: string, title: string, error: { code?: string; message: string }) {
  return new DayLaunchError(code, `${title}: ${error.message}`, rpcStatus(error));
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
