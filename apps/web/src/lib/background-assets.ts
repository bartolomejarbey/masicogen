import { createHash, randomUUID } from "node:crypto";
import { storageBuckets } from "./env";
import { generateBackgroundImage, getOpenAIImageDimensions } from "./openai";
import { getSupabaseAdmin } from "./supabase-admin";

type StoredBackgroundInput = {
  orgId: string;
  userId: string;
  prompt: string;
  quality: "draft" | "final";
  templateKind: string;
};

type AssetInsertRow = {
  id: string;
  bucket: string;
  object_path: string;
};

export async function generateAndStoreBackground(input: StoredBackgroundInput) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase service role is not configured.");
  }

  const image = await generateBackgroundImage({
    prompt: buildBackgroundPrompt(input),
    quality: input.quality
  });
  const b64 = image.data?.find((item) => item.b64_json)?.b64_json;
  if (!b64) {
    throw new Error("OpenAI image response did not contain a base64 image.");
  }

  const file = Buffer.from(b64, "base64");
  const sha256 = createHash("sha256").update(file).digest("hex");
  const objectPath = `org/${input.orgId}/generated-backgrounds/${randomUUID()}.png`;
  const dimensions = getOpenAIImageDimensions();

  const upload = await supabase.storage
    .from(storageBuckets.generatedAssets)
    .upload(objectPath, file, {
      contentType: "image/png",
      upsert: false
    });

  if (upload.error) {
    throw new Error(`Background upload failed: ${upload.error.message}`);
  }

  const { data: asset, error: assetError } = await supabase
    .from("assets")
    .insert({
      org_id: input.orgId,
      bucket: storageBuckets.generatedAssets,
      object_path: objectPath,
      type: "image",
      sha256,
      width: dimensions.width,
      height: dimensions.height,
      size_bytes: file.byteLength,
      uploaded_by: input.userId,
      metadata: {
        prompt: input.prompt,
        quality: input.quality,
        templateKind: input.templateKind,
        noReadableTextRequired: true,
        generatedFor: "tv-template-background"
      }
    })
    .select("id, bucket, object_path")
    .single<AssetInsertRow>();

  if (assetError) {
    throw new Error(`Background asset insert failed: ${assetError.message}`);
  }

  const generation = await supabase.from("ai_generations").insert({
    org_id: input.orgId,
    generation_type: "template_background",
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    prompt: input.prompt,
    input_hash: createHash("sha256").update(input.prompt).digest("hex"),
    output_asset_id: asset.id,
    output_json: {
      bucket: asset.bucket,
      objectPath: asset.object_path,
      sha256,
      quality: input.quality,
      templateKind: input.templateKind
    },
    status: "succeeded",
    created_by: input.userId
  });

  if (generation.error) {
    throw new Error(`Background generation ledger insert failed: ${generation.error.message}`);
  }

  const { data: signedUrl, error: signedUrlError } = await supabase.storage
    .from(asset.bucket)
    .createSignedUrl(asset.object_path, 60 * 60);

  if (signedUrlError || !signedUrl?.signedUrl) {
    throw new Error(`Background signed URL failed: ${signedUrlError?.message ?? "missing URL"}`);
  }

  return {
    assetId: asset.id,
    bucket: asset.bucket,
    objectPath: asset.object_path,
    signedUrl: signedUrl.signedUrl,
    sha256,
    width: dimensions.width,
    height: dimensions.height,
    sizeBytes: file.byteLength
  };
}

function buildBackgroundPrompt(input: StoredBackgroundInput) {
  return [
    input.prompt,
    `Template kind: ${input.templateKind}.`,
    "Create a premium graphic design background for MASI-CO food TV signage.",
    "The image must be a background only: no readable text, no numbers, no logos, no menu boards, no fake prices.",
    "Leave generous clean negative space for deterministic overlay text.",
    "Use appetizing Czech cafeteria / modern bistro atmosphere, high contrast, professional signage composition."
  ].join(" ");
}
