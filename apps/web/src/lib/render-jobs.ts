import { createHash } from "node:crypto";
import { renderJobStatusSchema } from "@masico/shared";
import { queueNames } from "./env";
import { getSupabaseAdmin, supabaseAdminConfigured } from "./supabase-admin";

type RenderJobType = "render-preview" | "render-final";

type RenderJobRow = {
  id: string;
  org_id?: string;
  deck_version_id: string;
  status: string;
  job_type: RenderJobType;
  progress: number;
  attempts: number;
  created_at: string;
  error_message: string | null;
};

export function renderJobsConfigured() {
  return supabaseAdminConfigured();
}

export function createRenderJobIdempotencyKey(input: {
  jobType: RenderJobType;
  deckVersionId: string;
}) {
  return createHash("sha256")
    .update(`${input.jobType}:${input.deckVersionId}`)
    .digest("hex");
}

export async function createRenderJob(input: {
  orgId: string;
  deckVersionId: string;
  jobType: RenderJobType;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return null;
  }

  const idempotencyKey = createRenderJobIdempotencyKey(input);
  const existing = await supabase
    .from("render_jobs")
    .select("id, deck_version_id, status, job_type, progress, attempts, created_at, error_message")
    .eq("org_id", input.orgId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle<RenderJobRow>();

  if (existing.error) {
    throw new Error(`Render job lookup failed: ${existing.error.message}`);
  }

  if (existing.data) {
    return mapRenderJob(existing.data);
  }

  const inserted = await supabase
    .from("render_jobs")
    .insert({
      org_id: input.orgId,
      deck_version_id: input.deckVersionId,
      job_type: input.jobType,
      idempotency_key: idempotencyKey,
      status: "queued",
      progress: 0,
      attempts: 0
    })
    .select("id, deck_version_id, status, job_type, progress, attempts, created_at, error_message")
    .single<RenderJobRow>();

  if (inserted.error) {
    throw new Error(`Render job insert failed: ${inserted.error.message}`);
  }

  return mapRenderJob(inserted.data);
}

export async function getRenderJob(id: string, orgId?: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return null;
  }

  let query = supabase
    .from("render_jobs")
    .select("id, org_id, deck_version_id, status, job_type, progress, attempts, created_at, error_message")
    .eq("id", id);

  if (orgId) {
    query = query.eq("org_id", orgId);
  }

  const { data, error } = await query.maybeSingle<RenderJobRow>();

  if (error) {
    throw new Error(`Render job status lookup failed: ${error.message}`);
  }

  return data ? mapRenderJob(data) : null;
}

function mapRenderJob(row: RenderJobRow) {
  const jobType = row.job_type;

  return {
    id: row.id,
    deckVersionId: row.deck_version_id,
    status: renderJobStatusSchema.parse(row.status),
    queue: jobType === "render-preview" ? queueNames.renderPreview : queueNames.renderFinal,
    attempts: row.attempts,
    progress: row.progress,
    error: row.error_message,
    createdAt: row.created_at
  };
}
