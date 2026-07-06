import { randomUUID } from "node:crypto";

export const workerConfig = {
  workerId: process.env.WORKER_ID ?? `worker-${randomUUID()}`,
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 1),
  ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
  ffprobePath: process.env.FFPROBE_PATH ?? "ffprobe",
  maxRenderSeconds: Number(process.env.MAX_RENDER_SECONDS ?? 180),
  maxRenderDiskMb: Number(process.env.MAX_RENDER_DISK_MB ?? 1024),
  pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  queues: {
    aiExtractMenu: process.env.QUEUE_AI_EXTRACT_MENU ?? "ai-extract-menu",
    aiChatPatch: process.env.QUEUE_AI_CHAT_PATCH ?? "ai-chat-patch",
    aiGenerateImage: process.env.QUEUE_AI_GENERATE_IMAGE ?? "ai-generate-image",
    renderPreview: process.env.QUEUE_RENDER_PREVIEW ?? "render-preview",
    renderFinal: process.env.QUEUE_RENDER_FINAL ?? "render-final",
    publish: process.env.QUEUE_PUBLISH ?? "publish",
    maintenance: process.env.QUEUE_MAINTENANCE ?? "maintenance"
  }
};
