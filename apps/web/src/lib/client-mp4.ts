import { ArrayBufferTarget, Muxer } from "mp4-muxer";

/**
 * Vygeneruje MP4 smyčku PŘÍMO V PROHLÍŽEČI — žádný server, žádný TV hardware.
 * Každý slide se vyfotí z DOMu (html-to-image), pak se přes WebCodecs zakóduje
 * do H.264 a smyčka se opakuje do zadané celkové délky. Výsledek je Blob, který
 * si obsluha stáhne do PC a nahraje do TV.
 *
 * Statické slidy = po sobě jdoucí stejné snímky se v H.264 komprimují skoro na
 * nulu, takže i 30minutová smyčka je malý soubor.
 */

const WIDTH = 1920;
const HEIGHT = 1080;

export type Mp4SlideInput = {
  node: HTMLElement;
  durationSeconds: number;
};

export type Mp4Progress = {
  phase: "capture" | "encode" | "finalize";
  done: number;
  total: number;
};

export function webCodecsMp4Supported(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder !== "undefined" &&
    typeof (globalThis as { VideoFrame?: unknown }).VideoFrame !== "undefined"
  );
}

async function pickCodec(): Promise<string> {
  // Od nejkompatibilnějšího (main/high L4.0) po baseline.
  const candidates = ["avc1.4D4028", "avc1.640028", "avc1.42E01F"];
  const VideoEncoderCtor = (globalThis as unknown as { VideoEncoder: typeof VideoEncoder })
    .VideoEncoder;
  for (const codec of candidates) {
    try {
      const support = await VideoEncoderCtor.isConfigSupported({
        codec,
        width: WIDTH,
        height: HEIGHT,
        bitrate: 4_000_000
      });
      if (support.supported) {
        return codec;
      }
    } catch {
      // zkus další
    }
  }
  return "avc1.42E01F";
}

/**
 * Vyfotí každý slide do canvasu (jednou) a zakóduje smyčku do MP4.
 * @param slides pořadí slidů + délka každého (s)
 * @param totalSeconds celková délka výsledného videa (smyčka se opakuje)
 * @param frameRate snímků/s (statický obsah → stačí málo; default 5)
 */
export async function generateDeckMp4(options: {
  slides: Mp4SlideInput[];
  totalSeconds: number;
  frameRate?: number;
  onProgress?: (progress: Mp4Progress) => void;
}): Promise<Blob> {
  if (!webCodecsMp4Supported()) {
    throw new Error(
      "Tento prohlížeč neumí generovat MP4 (chybí WebCodecs). Použijte Chrome nebo novější Safari."
    );
  }
  const slides = options.slides.filter((slide) => slide.durationSeconds > 0);
  if (slides.length === 0) {
    throw new Error("Prezentace nemá žádné slidy k vygenerování.");
  }
  const fps = Math.max(1, Math.min(30, Math.round(options.frameRate ?? 5)));
  const totalSeconds = Math.max(1, Math.min(1800, options.totalSeconds));

  // 1) Vyfotit každý slide do canvasu (jednou).
  const { toCanvas } = await import("html-to-image");
  const canvases: HTMLCanvasElement[] = [];
  for (let index = 0; index < slides.length; index += 1) {
    options.onProgress?.({ phase: "capture", done: index, total: slides.length });
    const canvas = await toCanvas(slides[index]!.node, {
      cacheBust: true,
      pixelRatio: 1,
      width: WIDTH,
      height: HEIGHT,
      canvasWidth: WIDTH,
      canvasHeight: HEIGHT
    });
    canvases.push(canvas);
  }
  options.onProgress?.({ phase: "capture", done: slides.length, total: slides.length });

  // 2) Připravit muxer + encoder.
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: WIDTH, height: HEIGHT },
    fastStart: "in-memory"
  });
  const codec = await pickCodec();
  const VideoEncoderCtor = (globalThis as unknown as { VideoEncoder: typeof VideoEncoder })
    .VideoEncoder;
  const VideoFrameCtor = (globalThis as unknown as { VideoFrame: typeof VideoFrame }).VideoFrame;

  let encodeError: unknown = null;
  const encoder = new VideoEncoderCtor({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (error) => {
      encodeError = error;
    }
  });
  encoder.configure({
    codec,
    width: WIDTH,
    height: HEIGHT,
    bitrate: 4_000_000,
    framerate: fps
  });

  // 3) Sekvence snímků: smyčka slidů do celkové délky.
  const cycleSeconds = slides.reduce((sum, slide) => sum + slide.durationSeconds, 0);
  const totalFrames = Math.max(1, Math.round(totalSeconds * fps));
  const frameDurationUs = Math.round(1_000_000 / fps);
  const keyframeEvery = fps * 2; // klíčový snímek každé 2 s

  const activeCanvasForTime = (t: number): HTMLCanvasElement => {
    let within = cycleSeconds > 0 ? t % cycleSeconds : 0;
    for (let index = 0; index < slides.length; index += 1) {
      if (within < slides[index]!.durationSeconds) {
        return canvases[index]!;
      }
      within -= slides[index]!.durationSeconds;
    }
    return canvases[canvases.length - 1]!;
  };

  for (let frame = 0; frame < totalFrames; frame += 1) {
    if (encodeError) break;
    const timeSeconds = frame / fps;
    const canvas = activeCanvasForTime(timeSeconds);
    const videoFrame = new VideoFrameCtor(canvas, {
      timestamp: frame * frameDurationUs,
      duration: frameDurationUs
    });
    encoder.encode(videoFrame, { keyFrame: frame % keyframeEvery === 0 });
    videoFrame.close();

    if (frame % 15 === 0) {
      options.onProgress?.({ phase: "encode", done: frame, total: totalFrames });
    }
    // Backpressure: nenechat frontu encoderu přetéct.
    while (encoder.encodeQueueSize > 30 && !encodeError) {
      await new Promise((resolve) => setTimeout(resolve, 4));
    }
  }

  options.onProgress?.({ phase: "finalize", done: totalFrames, total: totalFrames });
  await encoder.flush();
  encoder.close();
  if (encodeError) {
    throw encodeError instanceof Error ? encodeError : new Error("Kódování MP4 selhalo.");
  }
  muxer.finalize();
  const { buffer } = muxer.target as ArrayBufferTarget;
  return new Blob([buffer], { type: "video/mp4" });
}
