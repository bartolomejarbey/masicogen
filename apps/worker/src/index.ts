import { demoDeck, demoMenu, demoMenuVersion, type RenderManifest } from "@masico/shared";
import { renderDeckToMp4 } from "./render-job";
import { workerConfig } from "./config";
import { processOneRenderJob } from "./jobs";
import { workerSupabaseConfigured } from "./supabase";

async function main() {
  console.log("MASI-CO worker booting", {
    concurrency: workerConfig.concurrency,
    queues: workerConfig.queues
  });

  const dryRunManifest: RenderManifest = {
    id: "dry-run-render",
    deck: {
      ...demoDeck,
      status: "approved",
      menuVersionId: demoMenuVersion.id
    },
    menu: demoMenu,
    output: {
      format: "mp4",
      codec: "h264",
      width: 1920,
      height: 1080,
      fps: 30,
      pixelFormat: "yuv420p",
      audio: "aac_silent_stereo",
      fastStart: true
    }
  };

  if (process.env.WORKER_DRY_RUN === "1") {
    const result = await renderDeckToMp4(dryRunManifest);
    console.log("Dry-run FFmpeg preset", result.ffmpegArgs.join(" "));
    return;
  }

  if (process.env.WORKER_SMOKE_RENDER === "1") {
    const result = await renderDeckToMp4(dryRunManifest);
    console.log("Smoke render output", {
      outputPath: result.outputPath,
      duration: result.probe?.format?.duration,
      streams: result.probe?.streams?.map((stream) => ({
        codec: stream.codec_name,
        type: stream.codec_type,
        width: stream.width,
        height: stream.height,
        pixelFormat: stream.pix_fmt,
        frameRate: stream.avg_frame_rate ?? stream.r_frame_rate,
        channels: stream.channels,
        sampleRate: stream.sample_rate
      }))
    });
    return;
  }

  if (!workerSupabaseConfigured()) {
    console.log(
      "Worker DB není nakonfigurovaná. Nastavte NEXT_PUBLIC_SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY, nebo WORKER_DRY_RUN=1 pro lokální preset."
    );
    return;
  }

  if (process.env.WORKER_POLL_ONCE === "1") {
    console.log("Worker poll-once result", await processOneRenderJob());
    return;
  }

  const concurrency = Math.max(1, workerConfig.concurrency);
  for (;;) {
    const results = await Promise.all(
      Array.from({ length: concurrency }, () => processOneRenderJob())
    );
    console.log("Worker poll results", results);
    await new Promise((resolve) => setTimeout(resolve, workerConfig.pollIntervalMs));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
