import { z } from "zod";
import { buildTextMenuImportPayload } from "@/lib/menu-import";
import {
  dayLaunchRequestSchema,
  launchDayMenu,
  DayLaunchError
} from "@/lib/day-launch";
import { requireStudioApiAccess, studioRoleGroups } from "@/lib/studio-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const textLaunchRequestSchema = z.object({
  locationId: z.string().uuid(),
  canteenId: z.string().uuid(),
  menuDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceText: z.string().trim().min(10).max(20000),
  screenId: z.string().uuid(),
  slideDurationsSeconds: dayLaunchRequestSchema.shape.slideDurationsSeconds,
  comment: z.string().trim().max(1000).optional()
});

type ScreenRow = {
  id: string;
  status: string;
  name: string;
};

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const access = await requireStudioApiAccess(studioRoleGroups.renderOperators);
  if (access instanceof Response) {
    return access;
  }

  if (access.mode !== "authenticated") {
    return Response.json(
      {
        error: "Spuštění na TV je dostupné jen po přihlášení do produkčního studia.",
        code: "today_launch_auth_required"
      },
      { status: 401 }
    );
  }

  const rawBody = await request.json().catch(() => ({}));
  const launchInput = await resolveLaunchInput(rawBody);
  if (launchInput instanceof Response) {
    return launchInput;
  }

  if (launchInput.publish && launchInput.screenId) {
    const screenCheck = await verifyLaunchScreen({
      orgId: access.orgId,
      locationId: launchInput.locationId,
      canteenId: launchInput.canteenId,
      screenId: launchInput.screenId
    });

    if (screenCheck instanceof Response) {
      return screenCheck;
    }
  }

  const supabase = await createServerSupabaseClient();

  try {
    const result = await launchDayMenu(supabase, { ...launchInput, orgId: access.orgId });

    return Response.json({
      ok: true,
      mode: "live",
      menuVersionId: result.menuVersionId,
      menuId: result.menuId,
      deckId: result.deckId,
      deckVersionId: result.deckVersionId,
      screenId: result.published?.screenId ?? null,
      publishEventId: result.published?.publishEventId ?? null,
      publishedAt: result.published?.publishedAt ?? null,
      playerUrl: result.published
        ? new URL(`/tv/${result.published.screenId}`, request.url).toString()
        : null,
      itemCount: result.itemCount,
      slideCount: result.slideCount,
      loopDurationSeconds: result.loopDurationSeconds,
      warningCount: 0,
      warnings: [],
      note: result.published
        ? "TV web player běží live, novou verzi si načte do minuty."
        : "Menu je připravené a schválené, na TV zatím nepublikované."
    });
  } catch (error) {
    if (error instanceof DayLaunchError) {
      return Response.json(
        { error: error.message, code: error.code, issues: error.issues ?? [] },
        { status: error.status }
      );
    }

    return Response.json(
      {
        error: `Spuštění selhalo: ${error instanceof Error ? error.message : "neznámá chyba"}`,
        code: "today_launch_unexpected"
      },
      { status: 500 }
    );
  }
}

async function resolveLaunchInput(rawBody: unknown) {
  // Nová cesta: strukturované menu z denního formuláře.
  if (rawBody && typeof rawBody === "object" && "menu" in rawBody) {
    const parsed = dayLaunchRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return invalidInputResponse(parsed.error);
    }

    return parsed.data;
  }

  // Původní cesta: vložený text menu (Pokročilé) — parsujeme a pouštíme stejným flow.
  const parsed = textLaunchRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return invalidInputResponse(parsed.error);
  }

  const payload = buildTextMenuImportPayload({
    locationId: parsed.data.locationId,
    canteenId: parsed.data.canteenId,
    menuDate: parsed.data.menuDate,
    sourceText: parsed.data.sourceText
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

  return {
    locationId: parsed.data.locationId,
    canteenId: parsed.data.canteenId,
    menuDate: parsed.data.menuDate,
    menu: payload.menu,
    slideDurationsSeconds: parsed.data.slideDurationsSeconds,
    screenId: parsed.data.screenId,
    publish: true,
    comment: parsed.data.comment
  };
}

function invalidInputResponse(error: z.ZodError) {
  return Response.json(
    {
      error: "Spuštění nemá platná vstupní data.",
      code: "invalid_today_launch_input",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    },
    { status: 400 }
  );
}

async function verifyLaunchScreen(input: {
  orgId: string;
  locationId: string;
  canteenId: string;
  screenId: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return Response.json(
      {
        error: "Supabase service role není nakonfigurovaná pro ověření TV.",
        code: "today_launch_admin_not_configured"
      },
      { status: 503 }
    );
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
    return Response.json(
      {
        error: `Vyhledání TV obrazovky selhalo: ${error.message}`,
        code: "today_launch_screen_failed"
      },
      { status: 502 }
    );
  }

  if (!data) {
    return Response.json(
      {
        error: "Vybraná TV nepatří k této jídelně. Vyberte spárovanou TV v nastavení.",
        code: "today_launch_screen_mismatch"
      },
      { status: 422 }
    );
  }

  if (data.status === "unpaired") {
    return Response.json(
      {
        error: `TV "${data.name}" ještě není spárovaná. Nejdřív ji spárujte v nastavení.`,
        code: "today_launch_screen_unpaired"
      },
      { status: 422 }
    );
  }

  return null;
}
