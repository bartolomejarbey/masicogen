import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { removeDishPhotoBackground } from "@/lib/openai";
import { requireStudioApiAccess, studioRoleGroups } from "@/lib/studio-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const DISH_PHOTOS_BUCKET = "dish-photos";
const SIGNED_URL_SECONDS = 60 * 60;

const cutoutRequestSchema = z.object({
  path: z.string().min(1).max(400),
  dishName: z.string().trim().min(2).max(160),
  canteenId: z.string().uuid().optional(),
  mimeType: z.string().max(100).optional()
});

type AssetRow = { id: string; bucket: string; object_path: string };

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const access = await requireStudioApiAccess(studioRoleGroups.renderOperators);
  if (access instanceof Response) {
    return access;
  }

  if (access.mode !== "authenticated") {
    return Response.json(
      { error: "Úprava fotek je dostupná po přihlášení.", code: "dish_cutout_auth_required" },
      { status: 401 }
    );
  }

  const parsed = cutoutRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: "Vystřižení pozadí má neplatná data.", code: "dish_cutout_invalid_input" },
      { status: 400 }
    );
  }

  if (!parsed.data.path.startsWith(`org/${access.orgId}/dish-photos/`)) {
    return Response.json(
      { error: "Fotka nepatří do této organizace.", code: "dish_cutout_path_forbidden" },
      { status: 403 }
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return Response.json(
      { error: "Supabase service role není nakonfigurovaná.", code: "dish_cutout_admin_not_configured" },
      { status: 503 }
    );
  }

  const download = await admin.storage.from(DISH_PHOTOS_BUCKET).download(parsed.data.path);
  if (download.error || !download.data) {
    return Response.json(
      { error: "Původní fotka nebyla nalezena.", code: "dish_cutout_source_missing" },
      { status: 404 }
    );
  }

  let cutout: { data?: Array<{ b64_json?: string }> };
  try {
    cutout = await removeDishPhotoBackground({
      image: Buffer.from(await download.data.arrayBuffer()),
      mimeType: parsed.data.mimeType ?? "image/png",
      fileName: parsed.data.path.split("/").pop()
    });
  } catch (error) {
    return Response.json(
      {
        error: `Vystřižení pozadí selhalo: ${error instanceof Error ? error.message : "neznámá chyba"}`,
        code: "dish_cutout_failed"
      },
      { status: 502 }
    );
  }

  const b64 = cutout.data?.find((item) => item.b64_json)?.b64_json;
  if (!b64) {
    return Response.json(
      { error: "Model nevrátil upravený obrázek.", code: "dish_cutout_empty" },
      { status: 502 }
    );
  }

  const file = Buffer.from(b64, "base64");
  const cutoutPath = `org/${access.orgId}/dish-photos/${randomUUID()}-cutout.png`;

  const upload = await admin.storage.from(DISH_PHOTOS_BUCKET).upload(cutoutPath, file, {
    contentType: "image/png",
    upsert: false
  });

  if (upload.error) {
    return Response.json(
      { error: `Uložení vystřižené fotky selhalo: ${upload.error.message}`, code: "dish_cutout_upload_failed" },
      { status: 500 }
    );
  }

  const { data: asset, error: assetError } = await admin
    .from("assets")
    .insert({
      org_id: access.orgId,
      bucket: DISH_PHOTOS_BUCKET,
      object_path: cutoutPath,
      type: "image",
      sha256: createHash("sha256").update(file).digest("hex"),
      size_bytes: file.byteLength,
      uploaded_by: access.userId,
      metadata: {
        purpose: "dish_photo",
        dishName: parsed.data.dishName,
        cutout: true,
        sourcePath: parsed.data.path
      }
    })
    .select("id, bucket, object_path")
    .single<AssetRow>();

  if (assetError || !asset) {
    return Response.json(
      {
        error: `Evidence vystřižené fotky selhala: ${assetError?.message ?? "chybí asset"}`,
        code: "dish_cutout_asset_failed"
      },
      { status: 500 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const registered = await supabase.rpc("register_dish_photo", {
    target_org_id: access.orgId,
    target_asset_id: asset.id,
    target_dish_name: parsed.data.dishName,
    target_canteen_id: parsed.data.canteenId ?? null,
    target_focal_point: { x: 0.5, y: 0.5 }
  });

  if (registered.error) {
    return Response.json(
      {
        error: `Zařazení vystřižené fotky selhalo: ${registered.error.message}`,
        code: "dish_cutout_register_failed"
      },
      { status: 500 }
    );
  }

  // register_dish_photo nezná source (default 'upload') — výřez označíme
  // dodatečně přes service roli, aby ho knihovna odlišila od AI a uploadu.
  const sourceUpdate = await admin
    .from("dish_photos")
    .update({ source: "cutout" })
    .eq("org_id", access.orgId)
    .eq("asset_id", asset.id);

  if (sourceUpdate.error) {
    // Fotka je zaregistrovaná a funkční — špatný štítek původu nesmí shodit odpověď.
    console.error(`dish_cutout_source_update_failed: ${sourceUpdate.error.message}`);
  }

  const signed = await admin.storage
    .from(asset.bucket)
    .createSignedUrl(asset.object_path, SIGNED_URL_SECONDS);

  return Response.json({
    ok: true,
    assetId: asset.id,
    signedUrl: signed.data?.signedUrl ?? null
  });
}
