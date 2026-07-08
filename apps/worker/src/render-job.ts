import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderManifestSchema, type RenderManifest } from "@masico/shared";
import {
  buildConcatFfmpegArgs,
  buildConcatFile,
  buildFfmpegArgs,
  ffprobe,
  runCommand,
  type RenderedSlide
} from "./ffmpeg";
import { workerConfig } from "./config";
import { renderDeckSlidesWithChromium } from "./chromium-slide-renderer";
import { renderDeckSlidesToPng } from "./svg-slide-renderer";

export type RenderResult = {
  outputPath: string;
  tempDir: string;
  ffmpegArgs: string[];
  probe?: Awaited<ReturnType<typeof ffprobe>>;
};

export type RenderDeckOptions = {
  /** Mapa assetId → lokální cesta staženého assetu (downloadDeckAssets). */
  assets?: ReadonlyMap<string, string>;
};

export async function renderDeckToMp4(
  manifest: RenderManifest,
  options: RenderDeckOptions = {}
): Promise<RenderResult> {
  const parsed = renderManifestSchema.parse(manifest);
  const tempDir = await mkdtemp(join(tmpdir(), "masico-render-"));
  const framesDir = join(tempDir, "frames");
  const outputPath = join(tempDir, "render.mp4");

  await mkdir(framesDir, { recursive: true });

  try {
    const inputPattern = join(framesDir, "%06d.png");
    const ffmpegArgs = buildFfmpegArgs(inputPattern, outputPath);

    // The production implementation renders Remotion frames into framesDir before this command.
    // Keeping the command construction here makes the export preset testable and auditable.
    if (process.env.WORKER_DRY_RUN === "1") {
      return { outputPath, tempDir, ffmpegArgs };
    }

    // RENDER_ENGINE=svg = dočasný fallback na starou Resvg cestu.
    const renderedSlides: RenderedSlide[] =
      process.env.RENDER_ENGINE === "svg"
        ? await renderDeckSlidesToPng(parsed.deck, parsed.menu ?? null, framesDir)
        : await renderDeckSlidesWithChromium(parsed.deck, parsed.menu ?? null, framesDir, {
            assets: options.assets
          });
    const concatPath = join(tempDir, "concat.txt");
    await writeFile(concatPath, buildConcatFile(renderedSlides), "utf8");
    const expectedDurationSeconds = getExpectedDurationSeconds(parsed);
    const concatFfmpegArgs = buildConcatFfmpegArgs(concatPath, outputPath, expectedDurationSeconds);

    await runCommand(workerConfig.ffmpegPath, concatFfmpegArgs, {
      timeoutMs: workerConfig.maxRenderSeconds * 1000
    });
    const probe = await ffprobe(outputPath);
    await assertCompatibleMp4(outputPath, probe, expectedDurationSeconds);

    return { outputPath, tempDir, ffmpegArgs: concatFfmpegArgs, probe };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

export async function cleanupRenderResult(result: RenderResult) {
  await rm(result.tempDir, { recursive: true, force: true });
}

export async function assertCompatibleMp4(
  outputPath: string,
  probe: Awaited<ReturnType<typeof ffprobe>>,
  expectedDurationSeconds?: number
) {
  const outputStats = await stat(outputPath);
  if (outputStats.size <= 0) {
    throw new Error("Rendered MP4 is empty.");
  }

  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  const duration = Number(probe.format?.duration ?? 0);

  if (
    video?.codec_name !== "h264" ||
    video.width !== 1920 ||
    video.height !== 1080 ||
    video.pix_fmt !== "yuv420p"
  ) {
    throw new Error("Rendered MP4 video stream does not match the compatibility preset.");
  }

  if (!isThirtyFps(video.avg_frame_rate ?? video.r_frame_rate ?? "")) {
    throw new Error("Rendered MP4 is not 30 fps.");
  }

  if (audio?.codec_name !== "aac" || audio.channels !== 2 || audio.sample_rate !== "48000") {
    throw new Error("Rendered MP4 audio stream does not match the silent stereo AAC preset.");
  }

  if (expectedDurationSeconds && Math.abs(duration - expectedDurationSeconds) > 1.2) {
    throw new Error(
      `Rendered MP4 duration ${duration.toFixed(2)}s does not match expected ${expectedDurationSeconds.toFixed(2)}s.`
    );
  }
}

function getExpectedDurationSeconds(manifest: RenderManifest) {
  return manifest.deck.slides.reduce(
    (total, slide) => total + slide.durationFrames / manifest.deck.fps,
    0
  );
}

function isThirtyFps(value: string) {
  if (value === "30/1" || value === "30") {
    return true;
  }

  const [numerator, denominator] = value.split("/").map(Number);
  return denominator > 0 && Math.abs(numerator / denominator - 30) < 0.01;
}
