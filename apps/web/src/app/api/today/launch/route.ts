import { z } from "zod";
import { buildTextMenuImportPayload } from "@/lib/menu-import";
import { generateAndStoreBackground } from "@/lib/background-assets";
import { approvalRpcStatus } from "@/lib/approval-api";
import { requireStudioApiAccess } from "@/lib/studio-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const todayLaunchRequestSchema = z.object({
  locationId: z.string().uuid(),
  canteenId: z.string().uuid(),
  menuDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceText: z.string().trim().min(10).max(20000),
  screenId: z.string().uuid(),
  backgroundPrompt: z.string().trim().min(12).max(1200).optional(),
  backgroundQuality: z.enum(["draft", "final"]).default("draft"),
  backgroundAssetId: z.string().uuid().optional(),
  comment: z.string().trim().max(1000).optional()
});

type ImportTextMenuRpcRow = {
  org_id: string;
  menu_id: string;
  menu_version_id: string;
  source_id: string;
  menu_date: string;
  status: string;
};

type CreateDeckRpcRow = {
  org_id: string;
  deck_id: string;
  deck_version_id: string;
  menu_version_id: string;
  status: string;
};

type PublishLiveRpcRow = {
  screen_id: string;
  deck_version_id: string;
  publish_event_id: string;
  screen_status: string;
  published_at: string;
};

type ScreenRow = {
  id: string;
  status: string;
  name: string;
};

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const access = await requireStudioApiAccess(["owner", "admin"]);
  if (access instanceof Response) {
    return access;
  }

  if (access.mode !== "authenticated") {
    return Response.json(
      {
        error: "Dnešní spuštění je dostupné jen po přihlášení do produkčního studia.",
        code: "today_launch_auth_required"
      },
      { status: 401 }
    );
  }

  const parsedBody = todayLaunchRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsedBody.success) {
    return Response.json(
      {
        error: "Dnešní spuštění nemá platná vstupní data.",
        code: "invalid_today_launch_input",
        issues: parsedBody.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const admin = getSupabaseAdmin();
  if (!admin) {
    return Response.json(
      {
        error: "Supabase service role není nakonfigurovaná pro párování TV a Image 2 assety.",
        code: "today_launch_admin_not_configured"
      },
      { status: 503 }
    );
  }

  const payload = buildTextMenuImportPayload({
    locationId: parsedBody.data.locationId,
    canteenId: parsedBody.data.canteenId,
    menuDate: parsedBody.data.menuDate,
    sourceText: parsedBody.data.sourceText
  });

  if (payload.itemCount === 0) {
    return Response.json(
      {
        error: "V textu nebyla rozpoznaná žádná položka menu.",
        code: "today_launch_empty_menu",
        warnings: payload.menu.warnings
      },
      { status: 422 }
    );
  }

  const blockingIssues = payload.issues.filter((issue) => issue.severity === "error");
  if (blockingIssues.length > 0) {
    return Response.json(
      {
        error: "Před odesláním na TV opravte chybějící cenu nebo alergeny.",
        code: "today_launch_menu_validation_failed",
        issues: blockingIssues.map((issue) => ({
          code: issue.code,
          message: issue.message
        })),
        warnings: payload.menu.warnings
      },
      { status: 422 }
    );
  }

  const screenId = await resolveLaunchScreen({
    orgId: access.orgId,
    locationId: parsedBody.data.locationId,
    canteenId: parsedBody.data.canteenId,
    screenId: parsedBody.data.screenId
  }).catch((error: unknown) =>
    launchStepError("TV obrazovku se nepodařilo připravit", "today_launch_screen_failed", error, 422)
  );

  if (screenId instanceof Response) {
    return screenId;
  }

  const background = await resolveBackgroundAsset({
    orgId: access.orgId,
    userId: access.userId,
    prompt: parsedBody.data.backgroundPrompt,
    quality: parsedBody.data.backgroundQuality,
    backgroundAssetId: parsedBody.data.backgroundAssetId
  }).catch((error: unknown) =>
    launchStepError("Image 2 pozadí se nepodařilo vytvořit", "today_launch_background_failed", error, 502)
  );

  if (background instanceof Response) {
    return background;
  }

  const imported = await supabase.rpc("import_text_menu_version", {
    target_org_id: access.orgId,
    target_location_id: parsedBody.data.locationId,
    target_canteen_id: parsedBody.data.canteenId,
    target_menu_date: parsedBody.data.menuDate,
    source_text: parsedBody.data.sourceText,
    extraction_snapshot: payload.menu
  });

  if (imported.error) {
    return rpcError("Uložení menu selhalo", "today_launch_import_failed", imported.error);
  }

  const importResult = (imported.data as ImportTextMenuRpcRow[] | null)?.[0];
  if (!importResult) {
    return Response.json(
      { error: "Import menu nevrátil uloženou verzi.", code: "today_launch_import_missing_result" },
      { status: 500 }
    );
  }

  const approvedMenu = await supabase.rpc("approve_menu_version", {
    target_menu_version_id: importResult.menu_version_id,
    approval_comment: parsedBody.data.comment ?? "Dnešní spuštění: obsah potvrzen obsluhou."
  });

  if (approvedMenu.error) {
    return rpcError("Schválení menu selhalo", "today_launch_menu_approval_failed", approvedMenu.error);
  }

  const createdDeck = await supabase.rpc("create_tv_deck_from_menu_version", {
    target_menu_version_id: importResult.menu_version_id,
    target_background_asset_id: background?.assetId ?? null
  });

  if (createdDeck.error) {
    return rpcError("Vytvoření TV smyčky selhalo", "today_launch_deck_create_failed", createdDeck.error);
  }

  const deckResult = (createdDeck.data as CreateDeckRpcRow[] | null)?.[0];
  if (!deckResult) {
    return Response.json(
      { error: "Vytvoření TV smyčky nevrátilo deck verzi.", code: "today_launch_deck_missing_result" },
      { status: 500 }
    );
  }

  const approvedDeck = await supabase.rpc("approve_deck_version", {
    target_deck_version_id: deckResult.deck_version_id,
    approval_comment: parsedBody.data.comment ?? "Dnešní spuštění: layout potvrzen obsluhou."
  });

  if (approvedDeck.error) {
    return rpcError("Schválení TV smyčky selhalo", "today_launch_deck_approval_failed", approvedDeck.error);
  }

  const published = await supabase.rpc("publish_live_deck_to_screen", {
    target_screen_id: screenId,
    target_deck_version_id: deckResult.deck_version_id,
    publish_comment: parsedBody.data.comment ?? "Dnešní spuštění: live web player publish."
  });

  if (published.error) {
    return rpcError("Publikace na TV selhala", "today_launch_publish_failed", published.error);
  }

  const publishResult = (published.data as PublishLiveRpcRow[] | null)?.[0];
  if (!publishResult) {
    return Response.json(
      { error: "Publikace nevrátila publish event.", code: "today_launch_publish_missing_result" },
      { status: 500 }
    );
  }

  return Response.json({
    ok: true,
    mode: "live",
    menuVersionId: importResult.menu_version_id,
    menuId: importResult.menu_id,
    sourceId: importResult.source_id,
    deckId: deckResult.deck_id,
    deckVersionId: deckResult.deck_version_id,
    screenId,
    publishEventId: publishResult.publish_event_id,
    publishedAt: publishResult.published_at,
    playerUrl: new URL(`/tv/${screenId}`, request.url).toString(),
    background,
    itemCount: payload.itemCount,
    warningCount: payload.warningCount,
    warnings: payload.menu.warnings,
    note: "TV web player běží live bez čekání na MP4 worker. MP4 export lze doplnit později."
  });
}

async function resolveBackgroundAsset(input: {
  orgId: string;
  userId: string;
  prompt?: string;
  quality: "draft" | "final";
  backgroundAssetId?: string;
}) {
  if (input.backgroundAssetId) {
    return { assetId: input.backgroundAssetId, reused: true };
  }

  return generateAndStoreBackground({
    orgId: input.orgId,
    userId: input.userId,
    prompt:
      input.prompt ??
      "Moderní grafický design pro denní menu MASI-CO, kvalitní české jídlo, světlá čistá plocha pro text vlevo, teplé profesionální food signage pozadí.",
    quality: input.quality,
    templateKind: "daily_menu"
  });
}

async function resolveLaunchScreen(input: {
  orgId: string;
  locationId: string;
  canteenId: string;
  screenId: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error("Supabase service role is not configured.");
  }

  const { data, error } = await admin
    .from("screens")
    .select("id, status, name")
    .eq("org_id", input.orgId)
    .eq("id", input.screenId)
    .eq("location_id", input.locationId)
    .eq("canteen_id", input.canteenId)
    .maybeSingle<ScreenRow>();

  if (error) {
    throw new Error(`Vyhledání TV obrazovky selhalo: ${error.message}`);
  }

  if (!data) {
    throw new Error("Vybraná TV nepatří k této jídelně. Vyberte spárovanou TV v nastavení.");
  }

  if (data.status === "unpaired") {
    throw new Error(`TV "${data.name}" ještě není spárovaná. Nejdřív ji spárujte v nastavení.`);
  }

  return data.id;
}

function rpcError(title: string, code: string, error: { code?: string; message: string }) {
  return Response.json(
    {
      error: `${title}: ${error.message}`,
      code
    },
    { status: approvalRpcStatus(error) }
  );
}

function launchStepError(title: string, code: string, error: unknown, status: number) {
  return Response.json(
    {
      error: `${title}: ${error instanceof Error ? error.message : "neznámá chyba"}`,
      code
    },
    { status }
  );
}
