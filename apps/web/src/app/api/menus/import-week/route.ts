import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { storageBuckets } from "@/lib/env";
import { processDishPhotoJobs } from "@/lib/photo-queue";
import { requireStudioApiAccess, studioRoleGroups } from "@/lib/studio-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { importWeekFromUpload, WeekImportError } from "@/lib/weekly-import";

export const runtime = "nodejs";
export const maxDuration = 300;

/** HEIC/HEIF extraktor nepřečte — upload zóna nabízí jen tyto typy. */
const supportedMimeTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

const importWeekRequestSchema = z.object({
  locationId: z.string().uuid(),
  canteenId: z.string().uuid(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  path: z.string().min(1).max(500),
  mimeType: z.enum(supportedMimeTypes)
});

export async function POST(request: Request) {
  const access = await requireStudioApiAccess(studioRoleGroups.menuImporters);
  if (access instanceof Response) {
    return access;
  }

  if (access.mode !== "authenticated") {
    return Response.json(
      {
        error: "Týdenní import je dostupný jen po přihlášení do produkčního studia.",
        code: "week_import_auth_required"
      },
      { status: 401 }
    );
  }

  const parsedBody = importWeekRequestSchema.safeParse(await request.json().catch(() => ({})));

  if (!parsedBody.success) {
    return Response.json(
      {
        error: "Import týdne nemá platná vstupní data.",
        code: "invalid_week_import_input",
        issues: parsedBody.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      },
      { status: 400 }
    );
  }

  const body = parsedBody.data;

  if (!isMonday(body.weekStart)) {
    return Response.json(
      {
        error: "Začátek týdne musí být pondělí.",
        code: "week_start_not_monday"
      },
      { status: 422 }
    );
  }

  if (!body.path.startsWith(`org/${access.orgId}/`)) {
    return Response.json(
      {
        error: "Nahraný soubor nepatří vaší organizaci.",
        code: "week_source_org_mismatch"
      },
      { status: 403 }
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return Response.json(
      {
        error: "Supabase service role není nakonfigurovaná pro čtení nahraného lístku.",
        code: "week_import_admin_not_configured"
      },
      { status: 503 }
    );
  }

  const supabase = await createServerSupabaseClient();

  try {
    const result = await importWeekFromUpload({
      access: { orgId: access.orgId },
      supabase,
      admin,
      locationId: body.locationId,
      canteenId: body.canteenId,
      weekStart: body.weekStart,
      sourceBucket: storageBuckets.sourceUploads,
      sourcePath: body.path,
      sourceMime: body.mimeType
    });

    await recordWeekExtractRun(admin, {
      orgId: access.orgId,
      canteenId: body.canteenId,
      sourcePath: body.path,
      status: "succeeded",
      detail: { days: result.days, enqueuedPhotos: result.enqueuedPhotos }
    });

    // Inline dávka AI fotek — její selhání import nikdy neshodí.
    let photosProcessed = 0;
    try {
      const photoRun = await processDishPhotoJobs(admin, access.orgId, { limit: 10 });
      photosProcessed = photoRun.processed;
    } catch (error) {
      console.error("import-week: processDishPhotoJobs failed", error);
    }

    return Response.json({
      ok: true,
      weekStart: result.weekStart,
      days: result.days,
      enqueuedPhotos: result.enqueuedPhotos,
      photosProcessed
    });
  } catch (error) {
    if (error instanceof WeekImportError) {
      await recordWeekExtractRun(admin, {
        orgId: access.orgId,
        canteenId: body.canteenId,
        sourcePath: body.path,
        status: "failed",
        errorCode: error.code,
        errorMessage: error.message,
        detail: { sourcePath: body.path, weekStart: body.weekStart }
      });

      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("import-week: unexpected failure", error);

    return Response.json(
      {
        error: "Import týdne nečekaně selhal. Zkuste to prosím znovu.",
        code: "week_import_unexpected"
      },
      { status: 500 }
    );
  }
}

/**
 * Provozní stopa importu v automation_runs. dedupe_key = extract:{path};
 * duplicitní zápis (retry stejného souboru) se tiše ignoruje.
 */
async function recordWeekExtractRun(
  admin: SupabaseClient,
  input: {
    orgId: string;
    canteenId: string;
    sourcePath: string;
    status: "succeeded" | "failed";
    detail: Record<string, unknown>;
    errorCode?: string;
    errorMessage?: string;
  }
) {
  const { error } = await admin.from("automation_runs").upsert(
    {
      org_id: input.orgId,
      canteen_id: input.canteenId,
      run_type: "week_extract",
      entity_type: "menu_source",
      status: input.status,
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null,
      detail: input.detail,
      dedupe_key: `extract:${input.sourcePath}`,
      finished_at: new Date().toISOString()
    },
    { onConflict: "org_id,dedupe_key" }
  );

  if (error) {
    console.error("import-week: automation_runs write failed", error);
  }
}

function isMonday(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.getUTCDay() === 1;
}
