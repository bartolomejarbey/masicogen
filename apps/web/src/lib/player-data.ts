import {
  deckManifestSchema,
  menuExtractionResultSchema,
  playerManifestSchema,
  playerPayloadSchema,
  type PlayerManifest,
  type PlayerPayload
} from "@masico/shared";
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

type DeckVersionRow = {
  id: string;
  menu_version_id: string;
  manifest_json: unknown;
};

type MenuVersionRow = {
  id: string;
  snapshot: unknown;
};

type AssetRow = {
  id: string;
  bucket: string;
  object_path: string;
};

export function playerDataConfigured() {
  return supabaseAdminConfigured();
}

export async function getPublishedPlayerManifest(screenId: string): Promise<PlayerManifest | null> {
  const payload = await getPublishedPlayerPayload(screenId);
  return payload?.mode === "video" ? payload : null;
}

export async function getPublishedPlayerPayload(screenId: string): Promise<PlayerPayload | null> {
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
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<PublishEventRow>();

  if (publishError) {
    throw new Error(`Publish event lookup failed: ${publishError.message}`);
  }

  if (!publishEvent) {
    return null;
  }

  if (!publishEvent.export_id) {
    return getPublishedLivePlayerPayload({
      screenId,
      orgId: screen.org_id,
      deckVersionId: publishEvent.deck_version_id,
      publishedAt: publishEvent.created_at
    });
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
    mode: "video",
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

async function getPublishedLivePlayerPayload(input: {
  screenId: string;
  orgId: string;
  deckVersionId: string;
  publishedAt: string;
}): Promise<PlayerPayload | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return null;
  }

  const { data: deckVersion, error: deckError } = await supabase
    .from("deck_versions")
    .select("id, menu_version_id, manifest_json")
    .eq("org_id", input.orgId)
    .eq("id", input.deckVersionId)
    .maybeSingle<DeckVersionRow>();

  if (deckError) {
    throw new Error(`Live deck lookup failed: ${deckError.message}`);
  }

  if (!deckVersion) {
    return null;
  }

  const { data: menuVersion, error: menuError } = await supabase
    .from("menu_versions")
    .select("id, snapshot")
    .eq("org_id", input.orgId)
    .eq("id", deckVersion.menu_version_id)
    .maybeSingle<MenuVersionRow>();

  if (menuError) {
    throw new Error(`Live menu lookup failed: ${menuError.message}`);
  }

  if (!menuVersion) {
    return null;
  }

  const deck = deckManifestSchema.parse(deckVersion.manifest_json);
  const assetUrls = await getAssetSignedUrls(input.orgId, deck.assetIds);

  return playerPayloadSchema.parse({
    mode: "live",
    screenId: input.screenId,
    versionId: input.deckVersionId,
    status: "published",
    deck: {
      ...deck,
      status: "published",
      assetUrls
    },
    menu: menuExtractionResultSchema.parse(menuVersion.snapshot),
    publishedAt: input.publishedAt,
    heartbeatIntervalSeconds: 60
  });
}

async function getAssetSignedUrls(orgId: string, assetIds: string[]) {
  const supabase = getSupabaseAdmin();
  if (!supabase || assetIds.length === 0) {
    return {};
  }

  const { data: assets, error } = await supabase
    .from("assets")
    .select("id, bucket, object_path")
    .eq("org_id", orgId)
    .in("id", assetIds)
    .returns<AssetRow[]>();

  if (error) {
    throw new Error(`Live asset lookup failed: ${error.message}`);
  }

  const signedPairs = await Promise.all(
    (assets ?? []).map(async (asset) => {
      const { data, error: signedError } = await supabase.storage
        .from(asset.bucket)
        .createSignedUrl(asset.object_path, 15 * 60);

      if (signedError || !data?.signedUrl) {
        throw new Error(`Live asset signed URL failed: ${signedError?.message ?? "missing URL"}`);
      }

      return [asset.id, data.signedUrl] as const;
    })
  );

  return Object.fromEntries(signedPairs);
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
