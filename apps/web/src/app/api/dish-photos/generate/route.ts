import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { generateDishPhoto } from "@/lib/openai";
import { requireStudioApiAccess, studioRoleGroups } from "@/lib/studio-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const DISH_PHOTOS_BUCKET = "dish-photos";
const SIGNED_URL_SECONDS = 60 * 60;

const generatePhotoSchema = z.object({
  dishName: z.string().trim().min(2).max(160),
  description: z.string().trim().max(280).optional(),
  canteenId: z.string().uuid().optional()
});

type AssetRow = { id: string; bucket: string; object_path: string };

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Vygeneruje fotku jídla přes OpenAI, uloží ji do knihovny fotek a zaregistruje
 * jako zdroj "ai". Vrací assetId + signedUrl, které editor rovnou přiřadí položce.
 */
export async function POST(request: Request) {
  const access = await requireStudioApiAccess(studioRoleGroups.renderOperators);
  if (access instanceof Response) {
    return access;
  }

  if (access.mode !== "authenticated") {
    return Response.json(
      { error: "Generování fotek je dostupné po přihlášení.", code: "dish_generate_auth_required" },
      { status: 401 }
    );
  }

  const parsed = generatePhotoSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: "Generování fotky má neplatná data.", code: "dish_generate_invalid_input" },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return Response.json(
      { error: "Supabase service role není nakonfigurovaná.", code: "dish_generate_admin_not_configured" },
      { status: 503 }
    );
  }

  let generated: { data?: Array<{ b64_json?: string }> };
  try {
    generated = await generateDishPhoto({
      dishName: parsed.data.dishName,
      description: parsed.data.description ?? null
    });
  } catch (error) {
    return Response.json(
      {
        error: `Generování fotky selhalo: ${error instanceof Error ? error.message : "neznámá chyba"}`,
        code: "dish_generate_failed"
      },
      { status: 502 }
    );
  }

  const b64 = generated.data?.find((item) => item.b64_json)?.b64_json;
  if (!b64) {
    return Response.json(
      { error: "Model nevrátil obrázek.", code: "dish_generate_empty" },
      { status: 502 }
    );
  }

  const file = Buffer.from(b64, "base64");
  const objectPath = `org/${access.orgId}/dish-photos/${randomUUID()}-ai.png`;

  const upload = await admin.storage.from(DISH_PHOTOS_BUCKET).upload(objectPath, file, {
    contentType: "image/png",
    upsert: false
  });

  if (upload.error) {
    return Response.json(
      { error: `Uložení vygenerované fotky selhalo: ${upload.error.message}`, code: "dish_generate_upload_failed" },
      { status: 500 }
    );
  }

  const { data: asset, error: assetError } = await admin
    .from("assets")
    .insert({
      org_id: access.orgId,
      bucket: DISH_PHOTOS_BUCKET,
      object_path: objectPath,
      type: "image",
      sha256: createHash("sha256").update(file).digest("hex"),
      size_bytes: file.byteLength,
      uploaded_by: access.userId,
      metadata: {
        purpose: "dish_photo",
        dishName: parsed.data.dishName,
        ai: true
      }
    })
    .select("id, bucket, object_path")
    .single<AssetRow>();

  if (assetError || !asset) {
    return Response.json(
      {
        error: `Evidence vygenerované fotky selhala: ${assetError?.message ?? "chybí asset"}`,
        code: "dish_generate_asset_failed"
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
        error: `Zařazení vygenerované fotky selhalo: ${registered.error.message}`,
        code: "dish_generate_register_failed"
      },
      { status: 500 }
    );
  }

  // register_dish_photo nezná source (default 'upload') — AI fotku označíme
  // dodatečně přes service roli, aby ji knihovna odlišila od uploadu a výřezu.
  const sourceUpdate = await admin
    .from("dish_photos")
    .update({ source: "ai" })
    .eq("org_id", access.orgId)
    .eq("asset_id", asset.id);

  if (sourceUpdate.error) {
    console.error(`dish_generate_source_update_failed: ${sourceUpdate.error.message}`);
  }

  const signed = await admin.storage
    .from(asset.bucket)
    .createSignedUrl(asset.object_path, SIGNED_URL_SECONDS);

  return Response.json({
    ok: true,
    assetId: asset.id,
    signedUrl: signed.data?.signedUrl ?? null,
    source: "ai"
  });
}
