import { randomUUID } from "node:crypto";
import { type DeckManifest, type MenuExtractionResult, type RenderManifest } from "@masico/shared";
import { workerConfig } from "./config";
import { renderDeckToMp4 } from "./render-job";
import { createWorkerSupabaseClient } from "./supabase";

type RenderJobRow = {
  id: string;
  org_id: string;
  deck_version_id: string;
  attempts: number;
  max_attempts: number;
  lease_token: string | null;
};

type DeckVersionRow = {
  manifest_json: DeckManifest;
};

type MenuVersionRow = {
  snapshot: MenuExtractionResult;
};

export async function processOneRenderJob() {
  const supabase = createWorkerSupabaseClient();
  if (!supabase) {
    return { status: "not_configured" as const };
  }

  const job = await leaseNextRenderJob();
  if (!job) {
    return { status: "idle" as const };
  }

  try {
    const { data: deckVersion, error: deckError } = await supabase
      .from("deck_versions")
      .select("manifest_json")
      .eq("org_id", job.org_id)
      .eq("id", job.deck_version_id)
      .single<DeckVersionRow>();

    if (deckError || !deckVersion?.manifest_json) {
      throw new Error(`Deck version lookup failed: ${deckError?.message ?? "missing manifest"}`);
    }

    const { data: menuVersion, error: menuError } = await supabase
      .from("menu_versions")
      .select("snapshot")
      .eq("org_id", job.org_id)
      .eq("id", deckVersion.manifest_json.menuVersionId)
      .maybeSingle<MenuVersionRow>();

    if (menuError) {
      throw new Error(`Menu version lookup failed: ${menuError.message}`);
    }

    const manifest: RenderManifest = {
      id: job.id,
      deck: deckVersion.manifest_json,
      menu: menuVersion?.snapshot ?? null,
      output: {
        format: "mp4",
        codec: "h264",
        width: 1920,
        height: 1080,
        fps: 30,
        pixelFormat: "yuv420p",
        audio: "aac_silent_stereo",
        fastStart: true
      }
    };

    const result = await renderDeckToMp4(manifest);
    await updateLeasedRenderJob(job, {
      status: "succeeded",
      progress: 100,
      renderer_version: deckVersion.manifest_json.rendererVersion,
      ffprobe_json: result.probe ?? null,
      leased_by: null,
      lease_token: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString()
    });

    return { status: "succeeded" as const, jobId: job.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown render error";
    const failureStatus = getFailureStatus(job.attempts, job.max_attempts);
    await updateLeasedRenderJob(job, {
      status: failureStatus,
      error_message: errorMessage,
      leased_by: null,
      lease_token: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString()
    });

    return { status: failureStatus, jobId: job.id, error: errorMessage };
  }
}

export function getFailureStatus(attempts: number, maxAttempts: number) {
  return attempts < maxAttempts ? ("retrying" as const) : ("failed" as const);
}

async function leaseNextRenderJob() {
  const supabase = createWorkerSupabaseClient();
  if (!supabase) {
    return null;
  }

  await recoverExpiredRenderJobs();

  const { data: candidates, error } = await supabase
    .from("render_jobs")
    .select("id, org_id, deck_version_id, attempts, max_attempts, lease_token")
    .in("status", ["queued", "retrying"])
    .order("created_at", { ascending: true })
    .limit(10)
    .returns<RenderJobRow[]>();

  if (error) {
    throw new Error(`Render job lease lookup failed: ${error.message}`);
  }

  const job = candidates?.find((candidate) => candidate.attempts < candidate.max_attempts);
  if (!job) {
    return null;
  }

  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(Date.now() + workerConfig.maxRenderSeconds * 1000).toISOString();
  const { data: leased, error: leaseError } = await supabase
    .from("render_jobs")
    .update({
      status: "running",
      leased_by: workerConfig.workerId,
      lease_token: leaseToken,
      lease_expires_at: leaseExpiresAt,
      attempts: job.attempts + 1,
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", job.id)
    .eq("attempts", job.attempts)
    .lt("attempts", job.max_attempts)
    .in("status", ["queued", "retrying"])
    .select("id, org_id, deck_version_id, attempts, max_attempts, lease_token")
    .maybeSingle<RenderJobRow>();

  if (leaseError) {
    throw new Error(`Render job lease update failed: ${leaseError.message}`);
  }

  return leased;
}

async function updateLeasedRenderJob(job: RenderJobRow, patch: Record<string, unknown>) {
  const supabase = createWorkerSupabaseClient();
  if (!supabase) {
    throw new Error("Worker Supabase client is not configured.");
  }

  if (!job.lease_token) {
    throw new Error(`Render job ${job.id} is missing a lease token.`);
  }

  const { data, error } = await supabase
    .from("render_jobs")
    .update(patch)
    .eq("id", job.id)
    .eq("leased_by", workerConfig.workerId)
    .eq("lease_token", job.lease_token)
    .eq("status", "running")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(`Render job ${job.id} leased update failed: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Render job ${job.id} lease was lost before update.`);
  }
}

async function recoverExpiredRenderJobs() {
  const supabase = createWorkerSupabaseClient();
  if (!supabase) {
    return;
  }

  const now = new Date().toISOString();
  const { data: expiredJobs, error } = await supabase
    .from("render_jobs")
    .select("id, org_id, deck_version_id, attempts, max_attempts, lease_token")
    .in("status", ["leased", "running"])
    .lt("lease_expires_at", now)
    .limit(20)
    .returns<RenderJobRow[]>();

  if (error) {
    throw new Error(`Expired render job lookup failed: ${error.message}`);
  }

  for (const expiredJob of expiredJobs ?? []) {
    const nextStatus = getFailureStatus(expiredJob.attempts, expiredJob.max_attempts);
    let query = supabase
      .from("render_jobs")
      .update({
        status: nextStatus,
        leased_by: null,
        lease_token: null,
        lease_expires_at: null,
        error_message: "Worker lease expired before completion.",
        updated_at: now
      })
      .eq("id", expiredJob.id)
      .in("status", ["leased", "running"]);

    if (expiredJob.lease_token) {
      query = query.eq("lease_token", expiredJob.lease_token);
    }

    const { error: recoveryError } = await query;
    if (recoveryError) {
      throw new Error(`Expired render job recovery failed: ${recoveryError.message}`);
    }
  }
}
