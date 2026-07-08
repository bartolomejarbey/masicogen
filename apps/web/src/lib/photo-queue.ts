import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateDishPhoto } from "./openai";

const DISH_PHOTOS_BUCKET = "dish-photos";
const DEFAULT_BATCH_LIMIT = 5;
const PROMPT_VERSION = "dish-v1";

export type PhotoQueueResult = {
  processed: number;
  failed: number;
  skipped: number;
};

type DishPhotoJobRow = {
  id: string;
  org_id: string;
  canteen_id: string | null;
  dish_name: string;
  dish_name_normalized: string;
  description: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
};

type RegisteredAiPhotoRow = {
  dish_photo_id: string;
  dish_name_normalized: string;
};

/** Řídicí znaky pryč, max 160 znaků — název jde do image promptu i do DB. */
function sanitizeDishName(value: string) {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160)
    .trim();
}

function truncateError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

function isDuplicateStorageError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("already exists") || normalized.includes("duplicate");
}

/**
 * Zpracuje dávku fronty dish_photo_jobs: vygeneruje provizorní AI fotky
 * chybějících jídel a zaregistruje je přes register_ai_dish_photo (service
 * role only — AI fotka nikdy nedemotuje lidskou). Joby se zpracovávají
 * sekvenčně (image API je pomalé) a každý běží ve vlastním try/catch —
 * jeden pád nesmí zabít celou dávku. Selhání fotky nikdy neblokuje deck.
 */
export async function processDishPhotoJobs(
  admin: SupabaseClient,
  orgId: string,
  options: { limit?: number } = {}
): Promise<PhotoQueueResult> {
  const result: PhotoQueueResult = { processed: 0, failed: 0, skipped: 0 };

  // Vypínač automatiky: enabled=false zastaví i zpracování už zařazených
  // jobů (fronta počká, dokud admin fotky zase nezapne).
  const { data: orgRow } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle<{ settings: { automation?: { aiPhotos?: { enabled?: boolean } } } | null }>();

  if (orgRow?.settings?.automation?.aiPhotos?.enabled === false) {
    return result;
  }

  const { data: jobs, error: listError } = await admin
    .from("dish_photo_jobs")
    .select("id, org_id, canteen_id, dish_name, dish_name_normalized, description, status, attempts, max_attempts")
    .eq("org_id", orgId)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(options.limit ?? DEFAULT_BATCH_LIMIT)
    .returns<DishPhotoJobRow[]>();

  if (listError) {
    throw new Error(`Načtení fronty AI fotek selhalo: ${listError.message}`);
  }

  for (const job of jobs ?? []) {
    // Optimistický lease: jen jeden běh smí job převzít — druhý dostane 0 řádků.
    const lease = await admin
      .from("dish_photo_jobs")
      .update({
        status: "processing",
        attempts: job.attempts + 1,
        updated_at: new Date().toISOString()
      })
      .eq("id", job.id)
      .eq("status", "queued")
      .select("id");

    if (lease.error || (lease.data ?? []).length === 0) {
      result.skipped += 1;
      continue;
    }

    const attempts = job.attempts + 1;

    try {
      const dishName = sanitizeDishName(job.dish_name);
      if (dishName.length === 0) {
        throw new Error("Název jídla je po sanitizaci prázdný.");
      }

      const generated = await generateDishPhoto({
        dishName,
        description: job.description,
        quality: "medium"
      });

      const b64 = generated.data?.find((item) => item.b64_json)?.b64_json;
      if (!b64) {
        throw new Error("Model nevrátil obrázek jídla.");
      }

      const file = Buffer.from(b64, "base64");
      const sha256 = createHash("sha256").update(file).digest("hex");
      const normalizedSlug =
        job.dish_name_normalized.trim().replace(/\s+/g, "-") || "jidlo";
      const objectPath = `org/${orgId}/dish-photos/ai/${normalizedSlug}-${sha256.slice(0, 8)}.png`;

      const upload = await admin.storage.from(DISH_PHOTOS_BUCKET).upload(objectPath, file, {
        contentType: "image/png",
        upsert: false
      });

      // Kolize cesty = stejný obsah (cesta obsahuje hash) — považujeme za hotové.
      if (upload.error && !isDuplicateStorageError(upload.error.message)) {
        throw new Error(`Uložení AI fotky do storage selhalo: ${upload.error.message}`);
      }

      const { data: asset, error: assetError } = await admin
        .from("assets")
        .upsert(
          {
            org_id: orgId,
            bucket: DISH_PHOTOS_BUCKET,
            object_path: objectPath,
            type: "image",
            sha256,
            size_bytes: file.byteLength,
            uploaded_by: null,
            metadata: {
              purpose: "dish_photo",
              source: "ai",
              model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
              promptVersion: PROMPT_VERSION,
              dishName
            }
          },
          { onConflict: "bucket,object_path" }
        )
        .select("id")
        .single<{ id: string }>();

      if (assetError || !asset) {
        throw new Error(`Evidence AI fotky selhala: ${assetError?.message ?? "chybí asset"}`);
      }

      const registered = await admin.rpc("register_ai_dish_photo", {
        target_org_id: orgId,
        target_asset_id: asset.id,
        target_dish_name: dishName,
        target_canteen_id: job.canteen_id
      });

      if (registered.error) {
        throw new Error(`Registrace AI fotky selhala: ${registered.error.message}`);
      }

      const photoRow = (registered.data as RegisteredAiPhotoRow[] | null)?.[0] ?? null;

      const done = await admin
        .from("dish_photo_jobs")
        .update({
          status: "done",
          error_message: null,
          result_photo_id: photoRow?.dish_photo_id ?? null,
          updated_at: new Date().toISOString()
        })
        .eq("id", job.id);

      if (done.error) {
        throw new Error(`Dokončení jobu selhalo: ${done.error.message}`);
      }

      result.processed += 1;
    } catch (jobError) {
      const errorMessage = truncateError(jobError);
      const exhausted = attempts >= job.max_attempts;

      await admin
        .from("dish_photo_jobs")
        .update({
          status: exhausted ? "failed" : "queued",
          error_message: errorMessage,
          updated_at: new Date().toISOString()
        })
        .eq("id", job.id);

      if (exhausted) {
        await admin.from("automation_runs").upsert(
          {
            org_id: orgId,
            canteen_id: job.canteen_id,
            run_type: "dish_photo",
            entity_type: "dish_photo_job",
            entity_id: job.id,
            status: "failed",
            error_message: errorMessage,
            detail: { dishName: job.dish_name, attempts },
            attempts,
            dedupe_key: `photo:${job.id}`,
            finished_at: new Date().toISOString()
          },
          { onConflict: "org_id,dedupe_key", ignoreDuplicates: true }
        );
      }

      result.failed += 1;
    }
  }

  return result;
}
