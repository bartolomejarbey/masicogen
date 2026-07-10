import type { SupabaseClient } from "@supabase/supabase-js";
import { MANUAL_PRESENTATION_EXTRACTION_MODEL } from "@masico/shared";
import { isLocalDev, requireConfiguredIntegration, safeEqual } from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 120;

/** TV se hlásí každou minutu — 10 minut ticha znamená problém. */
const HEARTBEAT_ONLINE_MS = 10 * 60_000;
const FAILED_JOBS_WINDOW_MS = 24 * 60 * 60_000;

type CanteenRow = {
  id: string;
  org_id: string;
  location_id: string;
  name: string;
};

type LocationRow = {
  id: string;
  org_id: string;
  timezone: string | null;
};

type MenuVersionRow = {
  id: string;
  status: string;
  extraction_model: string | null;
  created_at: string;
};

type MorningCheckDetail = {
  hasDeckToday: boolean;
  screensOnline: number;
  screensTotal: number;
  failedPhotoJobs: number;
  failedRenderJobs: number;
  pendingReview: boolean;
};

type CanteenCheckResult = {
  canteenId: string;
  canteenName: string;
  orgId: string;
  localDate: string;
  status: "succeeded" | "degraded" | "failed";
  detail?: MorningCheckDetail;
  error?: string;
};

export async function GET(request: Request) {
  return runMorningCheck(request);
}

export async function POST(request: Request) {
  return runMorningCheck(request);
}

/**
 * Ranní kontrola provozu (cron 03:30 UTC): pro každou jídelnu ověří, že na
 * dnešek (dle timezone provozovny) existuje schválený deck, TV žijí, fronty
 * nemají čerstvá selhání a žádný autopilotí draft nečeká na schválení.
 * Výsledek se zapisuje do automation_runs (1 záznam na jídelnu a den) a
 * čte ho homepage banner.
 */
async function runMorningCheck(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected && !isLocalDev()) {
    return Response.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }

  const provided = request.headers.get("authorization") ?? "";
  if (expected && !safeEqual(provided, `Bearer ${expected}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    const integrationUnavailable = requireConfiguredIntegration("Ranní kontrola");
    if (integrationUnavailable) {
      return integrationUnavailable;
    }

    return Response.json({
      ok: true,
      checked: 0,
      degraded: 0,
      results: [],
      note: "Supabase není nakonfigurováno — ranní kontrola přeskočena."
    });
  }

  const [canteensResult, locationsResult] = await Promise.all([
    admin.from("canteens").select("id, org_id, location_id, name").returns<CanteenRow[]>(),
    admin.from("locations").select("id, org_id, timezone").returns<LocationRow[]>()
  ]);

  if (canteensResult.error || locationsResult.error) {
    return Response.json(
      {
        error: `Načtení jídelen selhalo: ${
          canteensResult.error?.message ?? locationsResult.error?.message
        }`
      },
      { status: 502 }
    );
  }

  const timezoneByLocation = new Map(
    (locationsResult.data ?? []).map((location) => [
      `${location.org_id}:${location.id}`,
      location.timezone ?? "Europe/Prague"
    ])
  );

  const sinceIso = new Date(Date.now() - FAILED_JOBS_WINDOW_MS).toISOString();
  const failedCountsByOrg = new Map<string, { failedPhotoJobs: number; failedRenderJobs: number }>();
  const results: CanteenCheckResult[] = [];

  for (const canteen of canteensResult.data ?? []) {
    const timezone =
      timezoneByLocation.get(`${canteen.org_id}:${canteen.location_id}`) ?? "Europe/Prague";
    const localDate = getLocalDateIso(timezone);

    try {
      const [deckState, screenState, failedJobs] = await Promise.all([
        checkTodayDeck(admin, canteen, localDate),
        checkScreens(admin, canteen),
        getFailedJobCounts(admin, canteen.org_id, sinceIso, failedCountsByOrg)
      ]);

      const detail: MorningCheckDetail = {
        hasDeckToday: deckState.hasDeckToday,
        screensOnline: screenState.screensOnline,
        screensTotal: screenState.screensTotal,
        failedPhotoJobs: failedJobs.failedPhotoJobs,
        failedRenderJobs: failedJobs.failedRenderJobs,
        pendingReview: deckState.pendingReview
      };

      const status: "succeeded" | "degraded" =
        detail.hasDeckToday &&
        detail.screensOnline === detail.screensTotal &&
        detail.failedPhotoJobs === 0 &&
        detail.failedRenderJobs === 0 &&
        !detail.pendingReview
          ? "succeeded"
          : "degraded";

      const nowIso = new Date().toISOString();
      const logged = await admin.from("automation_runs").upsert(
        {
          org_id: canteen.org_id,
          canteen_id: canteen.id,
          run_type: "morning_check",
          entity_type: "canteen",
          entity_id: canteen.id,
          status,
          detail,
          dedupe_key: `morning:${canteen.id}:${localDate}`,
          started_at: nowIso,
          finished_at: nowIso
        },
        { onConflict: "org_id,dedupe_key" }
      );

      if (logged.error) {
        throw new Error(`Zápis do automation_runs selhal: ${logged.error.message}`);
      }

      results.push({
        canteenId: canteen.id,
        canteenName: canteen.name,
        orgId: canteen.org_id,
        localDate,
        status,
        detail
      });
    } catch (checkError) {
      results.push({
        canteenId: canteen.id,
        canteenName: canteen.name,
        orgId: canteen.org_id,
        localDate,
        status: "failed",
        error: checkError instanceof Error ? checkError.message : String(checkError)
      });
    }
  }

  return Response.json({
    ok: results.every((result) => result.status !== "failed"),
    checked: results.length,
    degraded: results.filter((result) => result.status === "degraded").length,
    results
  });
}

/**
 * (a) approved/published deck na dnešek + (d) autopilotí draft bez approve.
 * Cesta menu → menu_versions → deck_versions se dělá třemi dotazy záměrně:
 * PostgREST embedding mezi menus a menu_versions je nejednoznačný
 * (menu_id vs. current_version_id).
 */
async function checkTodayDeck(
  admin: SupabaseClient,
  canteen: CanteenRow,
  localDate: string
): Promise<{ hasDeckToday: boolean; pendingReview: boolean }> {
  const menuResult = await admin
    .from("menus")
    .select("id")
    .eq("org_id", canteen.org_id)
    .eq("canteen_id", canteen.id)
    .eq("menu_date", localDate)
    .maybeSingle<{ id: string }>();

  if (menuResult.error) {
    throw new Error(`Načtení dnešního menu selhalo: ${menuResult.error.message}`);
  }

  if (!menuResult.data) {
    return { hasDeckToday: false, pendingReview: false };
  }

  const versionsResult = await admin
    .from("menu_versions")
    .select("id, status, extraction_model, created_at")
    .eq("org_id", canteen.org_id)
    .eq("menu_id", menuResult.data.id)
    // Verze ručních prezentací nejsou denní menu — NULL-safe vyloučení.
    .or(`extraction_model.is.null,extraction_model.neq.${MANUAL_PRESENTATION_EXTRACTION_MODEL}`)
    .order("created_at", { ascending: false })
    .returns<MenuVersionRow[]>();

  if (versionsResult.error) {
    throw new Error(`Načtení verzí menu selhalo: ${versionsResult.error.message}`);
  }

  const versions = versionsResult.data ?? [];
  const latest = versions[0] ?? null;
  const pendingReview = Boolean(
    latest && latest.status === "draft" && latest.extraction_model === "openai-vision-week"
  );

  if (versions.length === 0) {
    return { hasDeckToday: false, pendingReview };
  }

  const decksResult = await admin
    .from("deck_versions")
    .select("id")
    .eq("org_id", canteen.org_id)
    .in(
      "menu_version_id",
      versions.map((version) => version.id)
    )
    .in("status", ["approved", "published"])
    .limit(1);

  if (decksResult.error) {
    throw new Error(`Načtení decků selhalo: ${decksResult.error.message}`);
  }

  return { hasDeckToday: (decksResult.data ?? []).length > 0, pendingReview };
}

/** (b) heartbeat obrazovek jídelny < 10 minut. */
async function checkScreens(
  admin: SupabaseClient,
  canteen: CanteenRow
): Promise<{ screensOnline: number; screensTotal: number }> {
  const screensResult = await admin
    .from("screens")
    .select("id, last_heartbeat_at")
    .eq("org_id", canteen.org_id)
    .eq("canteen_id", canteen.id)
    .returns<Array<{ id: string; last_heartbeat_at: string | null }>>();

  if (screensResult.error) {
    throw new Error(`Načtení obrazovek selhalo: ${screensResult.error.message}`);
  }

  const screens = screensResult.data ?? [];
  const now = Date.now();
  const screensOnline = screens.filter((screen) => {
    if (!screen.last_heartbeat_at) {
      return false;
    }

    const ageMs = now - new Date(screen.last_heartbeat_at).getTime();
    return Number.isFinite(ageMs) && ageMs < HEARTBEAT_ONLINE_MS;
  }).length;

  return { screensOnline, screensTotal: screens.length };
}

/** (c) selhané joby za 24 h — počítá se per org a cachuje mezi jídelnami. */
async function getFailedJobCounts(
  admin: SupabaseClient,
  orgId: string,
  sinceIso: string,
  cache: Map<string, { failedPhotoJobs: number; failedRenderJobs: number }>
) {
  const cached = cache.get(orgId);
  if (cached) {
    return cached;
  }

  const [photoResult, renderResult] = await Promise.all([
    admin
      .from("dish_photo_jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "failed")
      .gte("updated_at", sinceIso),
    admin
      .from("render_jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "failed")
      .gte("updated_at", sinceIso)
  ]);

  if (photoResult.error) {
    throw new Error(`Načtení selhaných foto jobů selhalo: ${photoResult.error.message}`);
  }

  if (renderResult.error) {
    throw new Error(`Načtení selhaných render jobů selhalo: ${renderResult.error.message}`);
  }

  const counts = {
    failedPhotoJobs: photoResult.count ?? 0,
    failedRenderJobs: renderResult.count ?? 0
  };
  cache.set(orgId, counts);
  return counts;
}

function getLocalDateIso(timezone: string) {
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Prague",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  }
}
