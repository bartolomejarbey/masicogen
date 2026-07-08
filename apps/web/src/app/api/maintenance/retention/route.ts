import type { SupabaseClient } from "@supabase/supabase-js";
import { processDishPhotoJobs } from "@/lib/photo-queue";
import { isLocalDev, requireConfiguredIntegration, safeEqual } from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 300;

const RETENTION_DAYS = 30;
const PHOTO_SWEEP_DAYS_AHEAD = 7;
const PHOTO_SWEEP_BATCH_LIMIT = 10;

type OrgRow = { id: string };
type MenuRow = { id: string; menu_date: string };
type MenuVersionRow = { id: string; menu_id: string; status: string; created_at: string };

type PhotoSweepSummary = {
  orgs: number;
  enqueued: number;
  processed: number;
  failed: number;
  skipped: number;
  errors: string[];
};

export async function GET(request: Request) {
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
    const integrationUnavailable = requireConfiguredIntegration("Retenční cleanup");
    if (integrationUnavailable) {
      return integrationUnavailable;
    }

    return Response.json({
      ok: true,
      cleaned: {
        renderArtifacts: 0,
        failedJobs: 0,
        expiredSignedUrls: 0,
        automationRuns: 0,
        dishPhotoJobs: 0
      },
      photoSweep: null,
      note: "Supabase není nakonfigurováno — retenční cleanup přeskočen."
    });
  }

  const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60_000).toISOString();
  const staleProcessingIso = new Date(Date.now() - 15 * 60_000).toISOString();

  // Joby zaseknuté v processing (spadlý proces, utnutý maxDuration) blokují
  // partial-unique indexem jakoukoli další fotku téhož jídla — vracíme je
  // do fronty; vyčerpané pokusy končí jako failed.
  const [requeuedStale, failedStale] = await Promise.all([
    admin
      .from("dish_photo_jobs")
      .update({ status: "queued" })
      .eq("status", "processing")
      .lt("updated_at", staleProcessingIso)
      .lt("attempts", 3)
      .select("id"),
    admin
      .from("dish_photo_jobs")
      .update({ status: "failed", error_message: "Zpracování se zaseklo a vyčerpalo pokusy." })
      .eq("status", "processing")
      .lt("updated_at", staleProcessingIso)
      .gte("attempts", 3)
      .select("id")
  ]);

  // Purge provozního logu a dokončených/selhaných foto jobů starších 30 dní.
  const [purgedRuns, purgedJobs] = await Promise.all([
    admin.from("automation_runs").delete().lt("started_at", cutoffIso).select("id"),
    admin
      .from("dish_photo_jobs")
      .delete()
      .in("status", ["done", "failed"])
      .lt("created_at", cutoffIso)
      .select("id")
  ]);

  const purgeErrors = [
    requeuedStale.error ? `stale requeue: ${requeuedStale.error.message}` : null,
    failedStale.error ? `stale fail: ${failedStale.error.message}` : null,
    purgedRuns.error ? `automation_runs: ${purgedRuns.error.message}` : null,
    purgedJobs.error ? `dish_photo_jobs: ${purgedJobs.error.message}` : null
  ].filter((value): value is string => Boolean(value));

  const photoSweep = await runNightlyPhotoSweep(admin);

  return Response.json({
    ok: purgeErrors.length === 0 && photoSweep.errors.length === 0,
    cleaned: {
      renderArtifacts: 0,
      failedJobs: 0,
      expiredSignedUrls: 0,
      automationRuns: purgedRuns.data?.length ?? 0,
      dishPhotoJobs: purgedJobs.data?.length ?? 0
    },
    photoSweep,
    errors: [...purgeErrors, ...photoSweep.errors],
    note: "Render artefakty a signed URL se čistí přes lifecycle storage — tady zůstávají na 0."
  });
}

/**
 * Noční photo-sweep: pro menu dnes..+7 dní zařadí chybějící AI fotky
 * (enqueue_missing_dish_photos na nejnovější draft/approved verzi každého
 * menu — RPC sama dedupuje přes aktivní joby a existující fotky) a pak
 * zpracuje dávku fronty. Chyba jedné organizace nesmí shodit celý cron.
 */
async function runNightlyPhotoSweep(admin: SupabaseClient): Promise<PhotoSweepSummary> {
  const summary: PhotoSweepSummary = {
    orgs: 0,
    enqueued: 0,
    processed: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  const orgsResult = await admin.from("organizations").select("id").returns<OrgRow[]>();
  if (orgsResult.error) {
    summary.errors.push(`organizations: ${orgsResult.error.message}`);
    return summary;
  }

  const todayIso = getPragueTodayIso();
  const untilIso = addDaysIso(todayIso, PHOTO_SWEEP_DAYS_AHEAD);

  for (const org of orgsResult.data ?? []) {
    summary.orgs += 1;

    try {
      const menusResult = await admin
        .from("menus")
        .select("id, menu_date")
        .eq("org_id", org.id)
        .gte("menu_date", todayIso)
        .lte("menu_date", untilIso)
        .returns<MenuRow[]>();

      if (menusResult.error) {
        throw new Error(`menus: ${menusResult.error.message}`);
      }

      const menuIds = (menusResult.data ?? []).map((menu) => menu.id);

      if (menuIds.length > 0) {
        const versionsResult = await admin
          .from("menu_versions")
          .select("id, menu_id, status, created_at")
          .eq("org_id", org.id)
          .in("menu_id", menuIds)
          .in("status", ["draft", "approved"])
          .order("created_at", { ascending: false })
          .returns<MenuVersionRow[]>();

        if (versionsResult.error) {
          throw new Error(`menu_versions: ${versionsResult.error.message}`);
        }

        // Nejnovější draft/approved verze per menu — starší verze jsou
        // překonané a fronta by z nich řadila neaktuální jídla.
        const latestVersionByMenu = new Map<string, MenuVersionRow>();
        for (const version of versionsResult.data ?? []) {
          if (!latestVersionByMenu.has(version.menu_id)) {
            latestVersionByMenu.set(version.menu_id, version);
          }
        }

        for (const version of latestVersionByMenu.values()) {
          const enqueued = await admin.rpc("enqueue_missing_dish_photos", {
            target_org_id: org.id,
            target_menu_version_id: version.id
          });

          if (enqueued.error) {
            summary.errors.push(
              `enqueue_missing_dish_photos (${org.id}/${version.id}): ${enqueued.error.message}`
            );
            continue;
          }

          summary.enqueued += (enqueued.data as number | null) ?? 0;
        }
      }

      const queueResult = await processDishPhotoJobs(admin, org.id, {
        limit: PHOTO_SWEEP_BATCH_LIMIT
      });
      summary.processed += queueResult.processed;
      summary.failed += queueResult.failed;
      summary.skipped += queueResult.skipped;
    } catch (orgError) {
      summary.errors.push(
        `org ${org.id}: ${orgError instanceof Error ? orgError.message : String(orgError)}`
      );
    }
  }

  return summary;
}

function getPragueTodayIso() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function addDaysIso(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
