const requiredServerVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "WORKER_SHARED_SECRET"
] as const;

export function getEnv(name: string, fallback = "") {
  return process.env[name] ?? fallback;
}

export function getMissingServerEnv() {
  return requiredServerVars.filter((name) => !process.env[name]);
}

export const storageBuckets = {
  sourceUploads: getEnv("STORAGE_SOURCE_UPLOADS_BUCKET", "source-uploads"),
  generatedAssets: getEnv("STORAGE_GENERATED_ASSETS_BUCKET", "generated-assets"),
  templatePreviews: getEnv("STORAGE_TEMPLATE_PREVIEWS_BUCKET", "template-previews"),
  renderArtifacts: getEnv("STORAGE_RENDER_ARTIFACTS_BUCKET", "render-artifacts"),
  exports: getEnv("STORAGE_EXPORTS_BUCKET", "exports")
};

export const queueNames = {
  aiExtractMenu: getEnv("QUEUE_AI_EXTRACT_MENU", "ai-extract-menu"),
  aiChatPatch: getEnv("QUEUE_AI_CHAT_PATCH", "ai-chat-patch"),
  aiGenerateImage: getEnv("QUEUE_AI_GENERATE_IMAGE", "ai-generate-image"),
  renderPreview: getEnv("QUEUE_RENDER_PREVIEW", "render-preview"),
  renderFinal: getEnv("QUEUE_RENDER_FINAL", "render-final"),
  publish: getEnv("QUEUE_PUBLISH", "publish"),
  maintenance: getEnv("QUEUE_MAINTENANCE", "maintenance")
};
