import { spawn } from "node:child_process";
import { workerConfig } from "./config";

export type RenderedSlide = {
  durationSeconds: number;
  path: string;
};

export function buildConcatFile(slides: RenderedSlide[]) {
  if (slides.length === 0) {
    throw new Error("Cannot render an empty deck.");
  }

  const lines = slides.flatMap((slide) => [
    `file '${escapeConcatPath(slide.path)}'`,
    `duration ${slide.durationSeconds.toFixed(3)}`
  ]);
  lines.push(`file '${escapeConcatPath(slides[slides.length - 1].path)}'`);

  return `${lines.join("\n")}\n`;
}

export function escapeConcatPath(path: string) {
  return path.replace(/'/g, "'\\''");
}

export function buildFfmpegArgs(inputPattern: string, outputPath: string) {
  return buildCompatibleMp4Args(["-r", "30", "-i", inputPattern], outputPath);
}

export function buildConcatFfmpegArgs(
  concatPath: string,
  outputPath: string,
  durationSeconds?: number
) {
  return buildCompatibleMp4Args(
    ["-f", "concat", "-safe", "0", "-i", concatPath],
    outputPath,
    durationSeconds ? ["-t", durationSeconds.toFixed(3)] : []
  );
}

function buildCompatibleMp4Args(
  inputArgs: string[],
  outputPath: string,
  outputArgs: string[] = []
) {
  return [
    "-y",
    ...inputArgs,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-shortest",
    ...outputArgs,
    "-vf",
    "scale=1920:1080:flags=lanczos,setsar=1,fps=30,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-maxrate",
    "8M",
    "-bufsize",
    "16M",
    "-profile:v",
    "main",
    "-level:v",
    "4.0",
    "-g",
    "60",
    "-keyint_min",
    "60",
    "-sc_threshold",
    "0",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    outputPath
  ];
}

export async function runCommand(
  command: string,
  args: string[],
  options: { timeoutMs?: number; maxLogBytes?: number } = {}
) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const maxLogBytes = options.maxLogBytes ?? 200_000;
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`${command} timed out after ${options.timeoutMs}ms`));
        }, options.timeoutMs)
      : null;

    child.stdout.on("data", (chunk) => {
      stdout = trimLog(stdout + String(chunk), maxLogBytes);
    });
    child.stderr.on("data", (chunk) => {
      stderr = trimLog(stderr + String(chunk), maxLogBytes);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} exited with ${code}: ${stderr}`));
    });
  });
}

function trimLog(value: string, maxBytes: number) {
  if (value.length <= maxBytes) {
    return value;
  }

  return value.slice(value.length - maxBytes);
}

export async function ffprobe(path: string) {
  const { stdout } = await runCommand(
    workerConfig.ffprobePath,
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
    { timeoutMs: 30_000 }
  );

  return JSON.parse(stdout) as {
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      pix_fmt?: string;
      r_frame_rate?: string;
      avg_frame_rate?: string;
      channels?: number;
      sample_rate?: string;
    }>;
    format?: {
      duration?: string;
      size?: string;
    };
  };
}
