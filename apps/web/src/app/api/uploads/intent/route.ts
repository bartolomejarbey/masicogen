import { randomUUID } from "node:crypto";
import { storageBuckets } from "@/lib/env";
import {
  isUuidLike,
  requireConfiguredIntegration
} from "@/lib/security";
import { requireStudioApiAccess, studioRoleGroups } from "@/lib/studio-auth";
import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase-admin";

const allowedMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
];

const dishPhotoMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    orgId?: string;
    fileName?: string;
    mimeType?: string;
    purpose?: "menu_source" | "dish_photo";
  };
  const purpose = body.purpose === "dish_photo" ? "dish_photo" : "menu_source";

  const access = await requireStudioApiAccess(
    purpose === "dish_photo" ? studioRoleGroups.renderOperators : studioRoleGroups.contentEditors
  );
  if (access instanceof Response) {
    return access;
  }

  const allowedForPurpose = purpose === "dish_photo" ? dishPhotoMimeTypes : allowedMimeTypes;
  if (!body.mimeType || !allowedForPurpose.includes(body.mimeType)) {
    return Response.json(
      {
        error: "Nepodporovaný typ souboru.",
        allowedMimeTypes: allowedForPurpose
      },
      { status: 400 }
    );
  }

  const orgId = access.orgId;
  if (!isUuidLike(orgId)) {
    return Response.json({ error: "orgId musí být UUID." }, { status: 400 });
  }
  const objectId = randomUUID();
  const extension = body.fileName?.split(".").pop()?.toLowerCase() ?? "bin";
  const bucket = purpose === "dish_photo" ? "dish-photos" : storageBuckets.sourceUploads;
  const path =
    purpose === "dish_photo"
      ? `org/${orgId}/dish-photos/${objectId}.${extension}`
      : `org/${orgId}/sources/${objectId}.${extension}`;

  if (access.mode === "authenticated" && supabaseAdminConfigured()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase!.storage.from(bucket).createSignedUploadUrl(path);

    if (error || !data?.signedUrl) {
      return Response.json(
        { error: `Signed upload URL se nepodařilo vytvořit: ${error?.message ?? "missing URL"}` },
        { status: 502 }
      );
    }

    return Response.json({
      bucket,
      path,
      signedUrl: data.signedUrl,
      token: data.token,
      maxBytes: 25 * 1024 * 1024,
      uploadMethod: "supabase-storage-signed-upload",
      expiresInSeconds: 7200
    });
  }

  const integrationUnavailable = requireConfiguredIntegration("Upload jídelníčku");
  if (integrationUnavailable) {
    return integrationUnavailable;
  }

  return Response.json({
    bucket,
    path,
    maxBytes: 25 * 1024 * 1024,
    uploadMethod: "supabase-storage-signed-upload",
    note: "V produkci zde server vytvoří signed upload URL přes Supabase service role."
  });
}
