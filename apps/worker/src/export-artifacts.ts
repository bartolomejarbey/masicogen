import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import { workerConfig } from "./config";
import type { RenderResult } from "./render-job";

type PersistExportInput = {
  supabase: SupabaseClient;
  orgId: string;
  deckVersionId: string;
  renderJobId: string;
  renderResult: RenderResult;
};

type ExportRow = {
  id: string;
  object_path: string;
};

type AssetRow = {
  id: string;
};

export function buildExportObjectPath(input: {
  orgId: string;
  deckVersionId: string;
  renderJobId: string;
}) {
  return `org/${input.orgId}/exports/${input.deckVersionId}/${input.renderJobId}.mp4`;
}

export function getDurationSeconds(renderResult: RenderResult) {
  const duration = Number(renderResult.probe?.format?.duration ?? 0);
  return Number.isFinite(duration) && duration > 0 ? Number(duration.toFixed(2)) : null;
}

export async function getFileSha256(path: string) {
  const hash = createHash("sha256");

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return hash.digest("hex");
}

export async function persistFinalMp4Export(input: PersistExportInput) {
  const objectPath = buildExportObjectPath(input);
  const [fileBuffer, fileStats, checksum] = await Promise.all([
    readFile(input.renderResult.outputPath),
    stat(input.renderResult.outputPath),
    getFileSha256(input.renderResult.outputPath)
  ]);
  const durationSeconds = getDurationSeconds(input.renderResult);

  const upload = await input.supabase.storage
    .from(workerConfig.storage.exportsBucket)
    .upload(objectPath, fileBuffer, {
      contentType: "video/mp4",
      cacheControl: "31536000",
      upsert: true
    });

  if (upload.error) {
    throw new Error(`Export upload failed: ${upload.error.message}`);
  }

  const asset = await input.supabase
    .from("assets")
    .upsert(
      {
        org_id: input.orgId,
        bucket: workerConfig.storage.exportsBucket,
        object_path: objectPath,
        type: "render_export",
        sha256: checksum,
        width: 1920,
        height: 1080,
        size_bytes: fileStats.size,
        metadata: {
          render_job_id: input.renderJobId,
          deck_version_id: input.deckVersionId,
          duration_seconds: durationSeconds
        }
      },
      { onConflict: "bucket,object_path" }
    )
    .select("id")
    .single<AssetRow>();

  if (asset.error) {
    throw new Error(`Export asset upsert failed: ${asset.error.message}`);
  }

  const inserted = await input.supabase
    .from("exports")
    .upsert(
      {
        org_id: input.orgId,
        deck_version_id: input.deckVersionId,
        render_job_id: input.renderJobId,
        format: "mp4",
        bucket: workerConfig.storage.exportsBucket,
        object_path: objectPath,
        checksum,
        size_bytes: fileStats.size,
        duration_seconds: durationSeconds
      },
      { onConflict: "org_id,render_job_id" }
    )
    .select("id, object_path")
    .single<ExportRow>();

  if (inserted.error) {
    throw new Error(`Export row insert failed: ${inserted.error.message}`);
  }

  const event = await input.supabase.from("job_events").insert({
    org_id: input.orgId,
    render_job_id: input.renderJobId,
    event_type: "export_persisted",
    payload: {
      export_id: inserted.data.id,
      bucket: workerConfig.storage.exportsBucket,
      object_path: objectPath,
      checksum,
      size_bytes: fileStats.size,
      duration_seconds: durationSeconds
    }
  });

  if (event.error) {
    throw new Error(`Export job event insert failed: ${event.error.message}`);
  }

  return {
    exportId: inserted.data.id,
    assetId: asset.data.id,
    objectPath: inserted.data.object_path,
    checksum,
    sizeBytes: fileStats.size,
    durationSeconds
  };
}
