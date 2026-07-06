import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertCompatibleMp4 } from "./render-job";
import { buildConcatFile } from "./svg-slide-renderer";

describe("render job validation", () => {
  it("builds an FFmpeg concat file with explicit slide durations", () => {
    const concat = buildConcatFile([
      { path: "/tmp/slide-001.png", durationSeconds: 9 },
      { path: "/tmp/slide-002.png", durationSeconds: 8 }
    ]);

    expect(concat).toContain("duration 9.000");
    expect(concat).toContain("duration 8.000");
    expect(concat.trim().endsWith("file '/tmp/slide-002.png'")).toBe(true);
  });

  it("accepts the expected old-TV-compatible MP4 probe shape", async () => {
    const dir = await mkdtemp(join(tmpdir(), "masico-render-test-"));
    const outputPath = join(dir, "render.mp4");

    await writeFile(outputPath, "not-empty");
    await expect(
      assertCompatibleMp4(
        outputPath,
        {
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 1920,
              height: 1080,
              pix_fmt: "yuv420p",
              avg_frame_rate: "30/1"
            },
            {
              codec_type: "audio",
              codec_name: "aac",
              channels: 2,
              sample_rate: "48000"
            }
          ],
          format: {
            duration: "27.0",
            size: "9"
          }
        },
        27
      )
    ).resolves.toBeUndefined();

    await rm(dir, { recursive: true, force: true });
  });
});
