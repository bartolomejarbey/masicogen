import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildExportObjectPath, getDurationSeconds, getFileSha256 } from "./export-artifacts";

describe("render export artifacts", () => {
  it("builds an org-scoped export object path accepted by storage constraints", () => {
    expect(
      buildExportObjectPath({
        orgId: "org-123",
        deckVersionId: "deck-version-456",
        renderJobId: "job-789"
      })
    ).toBe("org/org-123/exports/deck-version-456/job-789.mp4");
  });

  it("reads duration from ffprobe metadata with stable precision", () => {
    expect(
      getDurationSeconds({
        outputPath: "/tmp/render.mp4",
        tempDir: "/tmp",
        ffmpegArgs: [],
        probe: {
          streams: [],
          format: {
            duration: "27.346",
            size: "1024"
          }
        }
      })
    ).toBe(27.35);
  });

  it("computes a sha256 checksum for the exported file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "masico-export-test-"));
    const path = join(dir, "render.mp4");

    await writeFile(path, "masico");

    await expect(getFileSha256(path)).resolves.toBe(
      "da2fae4fd2546711f41ccf52edd4a09b842d54538a5a1c004bdf59bcd442c7f4"
    );

    await rm(dir, { recursive: true, force: true });
  });
});
