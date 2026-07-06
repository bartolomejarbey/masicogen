import { describe, expect, it } from "vitest";
import { buildConcatFfmpegArgs, buildFfmpegArgs } from "./ffmpeg";

describe("FFmpeg preset", () => {
  it("targets old TV compatible H.264 MP4 settings", () => {
    const args = buildFfmpegArgs("frames/%06d.png", "output.mp4");
    const commandLine = args.join(" ");

    expect(args).toContain("libx264");
    expect(commandLine).toContain("yuv420p");
    expect(commandLine).toContain("setsar=1");
    expect(args).toContain("8M");
    expect(args).toContain("16M");
    expect(args).toContain("+faststart");
    expect(args).toContain("aac");
    expect(args).toContain("main");
  });

  it("pins concat renders to the deck duration", () => {
    const args = buildConcatFfmpegArgs("concat.txt", "output.mp4", 27);

    expect(args).toContain("-t");
    expect(args).toContain("27.000");
  });
});
