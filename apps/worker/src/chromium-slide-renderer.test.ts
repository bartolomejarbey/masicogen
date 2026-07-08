import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDailyDeckManifest, demoDeck, demoMenu } from "@masico/shared";
import {
  buildSlideHtml,
  readPngDimensions,
  renderDeckSlidesWithChromium,
  withLocalAssetUrls
} from "./chromium-slide-renderer";

describe("chromium slide HTML", () => {
  it("embeds Lora font faces and a fixed 1920x1080 stage", () => {
    const html = buildSlideHtml(demoDeck, demoMenu, demoDeck.slides[0].id);

    expect(html).toContain("@font-face");
    expect(html).toContain("font-family: 'Lora'");
    expect(html).toContain("./fonts/Lora.ttf");
    expect(html).toContain("./fonts/Lora-Italic.ttf");
    expect(html).toContain("font-display: block;");
    expect(html).toContain("--font-lora: 'Lora';");
    expect(html).toContain("width: 1920px; height: 1080px;");
    expect(html).toContain('<base href="../">');
  });

  it("renders the v1 legacy deck markup with menu content", () => {
    const html = buildSlideHtml(demoDeck, demoMenu, "slide-daily");

    expect(html).toContain("Gulášová");
    expect(html).toContain("Vepřový řízek");
  });

  it("rewrites deck asset URLs to the local web root", () => {
    const menu = structuredClone(demoMenu);
    menu.sections[1].items[0].photoAssetId = "asset-rizek";
    const deck = buildDailyDeckManifest(menu);
    expect(deck.assetIds).toContain("asset-rizek");

    const localDeck = withLocalAssetUrls(deck, new Map([["asset-rizek", "/tmp/asset-rizek"]]));
    expect(localDeck.assetUrls).toEqual({ "asset-rizek": "./assets/asset-rizek.png" });

    const html = buildSlideHtml(localDeck, menu, "slide-mains");
    expect(html).toContain("./assets/asset-rizek.png");
  });

  it("leaves missing assets without URL so the placeholder renders", () => {
    const menu = structuredClone(demoMenu);
    menu.sections[1].items[0].photoAssetId = "asset-missing";
    const deck = withLocalAssetUrls(buildDailyDeckManifest(menu), new Map());

    expect(deck.assetUrls).toEqual({});
    expect(() => buildSlideHtml(deck, menu, "slide-mains")).not.toThrow();
  });

  it("rewrites the brand logo path to the local web root", () => {
    const deck = buildDailyDeckManifest(demoMenu);
    const html = buildSlideHtml(deck, demoMenu, deck.slides[0].id);

    expect(html).toContain('"./brand/masico-logo.svg"');
    expect(html).not.toContain('"/brand/masico-logo.svg"');
  });
});

describe.runIf(process.env.WORKER_BROWSER_TESTS === "1")("chromium screenshot render", () => {
  it(
    "renders the first demo slide as a 1920x1080 PNG",
    async () => {
      const framesDir = await mkdtemp(join(tmpdir(), "masico-frames-test-"));

      try {
        const deck = { ...demoDeck, slides: [demoDeck.slides[0]] };
        const rendered = await renderDeckSlidesWithChromium(deck, demoMenu, framesDir);

        expect(rendered).toHaveLength(1);
        expect(rendered[0].durationSeconds).toBeCloseTo(
          demoDeck.slides[0].durationFrames / demoDeck.fps
        );
        await expect(readPngDimensions(rendered[0].path)).resolves.toEqual({
          width: 1920,
          height: 1080
        });
      } finally {
        await rm(framesDir, { recursive: true, force: true });
      }
    },
    180_000
  );
});
