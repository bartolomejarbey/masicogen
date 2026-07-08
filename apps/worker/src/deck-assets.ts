import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { workerConfig } from "./config";

type AssetRow = {
  id: string;
  bucket: string;
  object_path: string;
};

/**
 * Stáhne deck assety service-role klientem přímo ze storage (nezávislé na
 * expiraci signed URL) do targetDir a vrátí mapu assetId → lokální cesta.
 *
 * Chybějící nebo nestažitelný asset jen zaloguje a vynechá — TvComposition
 * pro něj vykreslí placeholder, render kvůli jedné fotce nespadne.
 */
export async function downloadDeckAssets(
  supabase: SupabaseClient,
  orgId: string,
  assetIds: string[],
  targetDir: string
): Promise<Map<string, string>> {
  const downloaded = new Map<string, string>();
  if (assetIds.length === 0) {
    return downloaded;
  }

  const { data: assets, error } = await supabase
    .from("assets")
    .select("id, bucket, object_path")
    .eq("org_id", orgId)
    .in("id", assetIds)
    .returns<AssetRow[]>();

  if (error) {
    throw new Error(`Deck asset lookup failed: ${error.message}`);
  }

  const rowsById = new Map((assets ?? []).map((asset) => [asset.id, asset]));
  const maxDiskBytes = workerConfig.maxRenderDiskMb * 1024 * 1024;
  let totalBytes = 0;

  for (const assetId of assetIds) {
    const row = rowsById.get(assetId);
    if (!row) {
      console.warn(`Deck asset ${assetId} not found for org ${orgId}; rendering placeholder.`);
      continue;
    }

    const { data, error: downloadError } = await supabase.storage
      .from(row.bucket)
      .download(row.object_path);

    if (downloadError || !data) {
      console.warn(
        `Deck asset ${assetId} download failed (${downloadError?.message ?? "no data"}); rendering placeholder.`
      );
      continue;
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    totalBytes += buffer.byteLength;
    if (totalBytes > maxDiskBytes) {
      throw new Error(
        `Deck assets exceed MAX_RENDER_DISK_MB (${workerConfig.maxRenderDiskMb} MB); aborting render.`
      );
    }

    const localPath = join(targetDir, assetId);
    await writeFile(localPath, buffer);
    downloaded.set(assetId, localPath);
  }

  return downloaded;
}
