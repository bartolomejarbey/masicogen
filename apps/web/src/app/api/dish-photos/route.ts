import { createHash } from "node:crypto";
import { z } from "zod";
import { requireStudioApiAccess, studioRoleGroups } from "@/lib/studio-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const DISH_PHOTOS_BUCKET = "dish-photos";
const SIGNED_URL_SECONDS = 60 * 60;

type DishPhotoRow = {
  id: string;
  asset_id: string;
  dish_name: string;
  dish_name_normalized: string;
  focal_point: { x: number; y: number };
  is_default: boolean;
  use_count: number;
  last_used_at: string | null;
  source: string;
  assets: { bucket: string; object_path: string } | null;
};

export async function GET(request: Request) {
  const access = await requireStudioApiAccess();
  if (access instanceof Response) {
    return access;
  }

  if (access.mode !== "authenticated") {
    return Response.json({ photos: [] });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const assetId = url.searchParams.get("assetId")?.trim() ?? "";

  const supabase = await createServerSupabaseClient();
  let photosQuery = supabase
    .from("dish_photos")
    .select("id, asset_id, dish_name, dish_name_normalized, focal_point, is_default, use_count, last_used_at, source, assets(bucket, object_path)")
    .eq("org_id", access.orgId)
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("use_count", { ascending: false })
    .limit(120);

  if (assetId.length > 0) {
    photosQuery = photosQuery.eq("asset_id", assetId).limit(1);
  } else if (query.length > 0) {
    photosQuery = photosQuery.ilike("dish_name", `%${query}%`);
  }

  const { data, error } = await photosQuery.returns<DishPhotoRow[]>();

  if (error) {
    return Response.json(
      { error: `Načtení knihovny fotek selhalo: ${error.message}`, code: "dish_photos_list_failed" },
      { status: 500 }
    );
  }

  const admin = getSupabaseAdmin();
  const photos = await Promise.all(
    (data ?? []).map(async (row) => {
      let signedUrl: string | null = null;

      if (admin && row.assets) {
        const signed = await admin.storage
          .from(row.assets.bucket)
          .createSignedUrl(row.assets.object_path, SIGNED_URL_SECONDS);
        signedUrl = signed.data?.signedUrl ?? null;
      }

      return {
        id: row.id,
        assetId: row.asset_id,
        dishName: row.dish_name,
        focalPoint: row.focal_point,
        isDefault: row.is_default,
        useCount: row.use_count,
        source: row.source,
        signedUrl
      };
    })
  );

  return Response.json({ photos });
}

const registerDishPhotoSchema = z.object({
  path: z.string().min(1).max(400),
  dishName: z.string().trim().min(2).max(160),
  canteenId: z.string().uuid().optional(),
  focalPoint: z
    .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
    .default({ x: 0.5, y: 0.5 }),
  mimeType: z.string().max(100).optional(),
  sizeBytes: z.number().int().positive().max(25 * 1024 * 1024).optional()
});

type AssetRow = { id: string; bucket: string; object_path: string };

export async function POST(request: Request) {
  const access = await requireStudioApiAccess(studioRoleGroups.renderOperators);
  if (access instanceof Response) {
    return access;
  }

  if (access.mode !== "authenticated") {
    return Response.json(
      { error: "Nahrávání fotek je dostupné po přihlášení.", code: "dish_photos_auth_required" },
      { status: 401 }
    );
  }

  const parsed = registerDishPhotoSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: "Fotku se nepodařilo uložit — neplatná data.", code: "dish_photos_invalid_input" },
      { status: 400 }
    );
  }

  if (!parsed.data.path.startsWith(`org/${access.orgId}/dish-photos/`)) {
    return Response.json(
      { error: "Fotka nepatří do této organizace.", code: "dish_photos_path_forbidden" },
      { status: 403 }
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return Response.json(
      { error: "Supabase service role není nakonfigurovaná.", code: "dish_photos_admin_not_configured" },
      { status: 503 }
    );
  }

  const download = await admin.storage.from(DISH_PHOTOS_BUCKET).download(parsed.data.path);
  if (download.error || !download.data) {
    return Response.json(
      {
        error: "Nahraná fotka nebyla nalezena — zkuste ji nahrát znovu.",
        code: "dish_photos_object_missing"
      },
      { status: 404 }
    );
  }

  const fileBuffer = Buffer.from(await download.data.arrayBuffer());
  const sha256 = createHash("sha256").update(fileBuffer).digest("hex");

  const { data: asset, error: assetError } = await admin
    .from("assets")
    .upsert(
      {
        org_id: access.orgId,
        bucket: DISH_PHOTOS_BUCKET,
        object_path: parsed.data.path,
        type: "image",
        sha256,
        size_bytes: parsed.data.sizeBytes ?? fileBuffer.byteLength,
        uploaded_by: access.userId,
        metadata: {
          purpose: "dish_photo",
          dishName: parsed.data.dishName,
          mimeType: parsed.data.mimeType ?? null
        }
      },
      { onConflict: "bucket,object_path" }
    )
    .select("id, bucket, object_path")
    .single<AssetRow>();

  if (assetError || !asset) {
    return Response.json(
      {
        error: `Uložení fotky do evidence selhalo: ${assetError?.message ?? "chybí asset"}`,
        code: "dish_photos_asset_failed"
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
    target_focal_point: parsed.data.focalPoint
  });

  if (registered.error) {
    return Response.json(
      {
        error: `Zařazení fotky ke jídlu selhalo: ${registered.error.message}`,
        code: "dish_photos_register_failed"
      },
      { status: 500 }
    );
  }

  const signed = await admin.storage
    .from(asset.bucket)
    .createSignedUrl(asset.object_path, SIGNED_URL_SECONDS);

  return Response.json({
    ok: true,
    assetId: asset.id,
    dishName: parsed.data.dishName,
    signedUrl: signed.data?.signedUrl ?? null
  });
}
