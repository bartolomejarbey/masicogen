import { type PlayerManifest, playerManifestSchema } from "@masico/shared";
import { getSupabaseAdmin, supabaseAdminConfigured } from "./supabase-admin";

type ScreenRow = {
  id: string;
  org_id: string;
  status: string;
};

type PublishEventRow = {
  deck_version_id: string;
  export_id: string | null;
  created_at: string;
};

type ExportRow = {
  id: string;
  bucket: string;
  object_path: string;
  checksum: string;
  duration_seconds: number | string | null;
};

export function playerDataConfigured() {
  return supabaseAdminConfigured();
}

export async function getPublishedPlayerManifest(screenId: string): Promise<PlayerManifest | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return null;
  }

  const { data: screen, error: screenError } = await supabase
    .from("screens")
    .select("id, org_id, status")
    .eq("id", screenId)
    .maybeSingle<ScreenRow>();

  if (screenError) {
    throw new Error(`Screen lookup failed: ${screenError.message}`);
  }

  if (!screen || screen.status !== "published") {
    return null;
  }

  const { data: publishEvent, error: publishError } = await supabase
    .from("publish_events")
    .select("deck_version_id, export_id, created_at")
    .eq("org_id", screen.org_id)
    .eq("screen_id", screen.id)
    .not("export_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<PublishEventRow>();

  if (publishError) {
    throw new Error(`Publish event lookup failed: ${publishError.message}`);
  }

  if (!publishEvent?.export_id) {
    return null;
  }

  const { data: exportRow, error: exportError } = await supabase
    .from("exports")
    .select("id, bucket, object_path, checksum, duration_seconds")
    .eq("org_id", screen.org_id)
    .eq("id", publishEvent.export_id)
    .eq("deck_version_id", publishEvent.deck_version_id)
    .eq("format", "mp4")
    .maybeSingle<ExportRow>();

  if (exportError) {
    throw new Error(`Export lookup failed: ${exportError.message}`);
  }

  if (!exportRow) {
    return null;
  }

  const { data: signedUrl, error: signedUrlError } = await supabase.storage
    .from(exportRow.bucket)
    .createSignedUrl(exportRow.object_path, 15 * 60);

  if (signedUrlError || !signedUrl?.signedUrl) {
    throw new Error(`Export signed URL failed: ${signedUrlError?.message ?? "missing URL"}`);
  }

  return playerManifestSchema.parse({
    screenId,
    versionId: publishEvent.deck_version_id,
    status: "published",
    videoUrl: signedUrl.signedUrl,
    checksum: exportRow.checksum,
    durationSeconds: Number(exportRow.duration_seconds ?? 1),
    publishedAt: publishEvent.created_at,
    heartbeatIntervalSeconds: 60
  });
}

export async function recordPlayerHeartbeat(input: {
  screenId: string;
  error?: string | null;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return false;
  }

  const { error } = await supabase
    .from("screens")
    .update({
      last_heartbeat_at: new Date().toISOString(),
      last_error: input.error ?? null
    })
    .eq("id", input.screenId);

  if (error) {
    throw new Error(`Heartbeat update failed: ${error.message}`);
  }

  return true;
}
