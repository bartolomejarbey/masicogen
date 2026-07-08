import { copyFile, mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ensureBrowser } from "@remotion/renderer";
import { TvComposition, getTvFontFaceCss, getTvFontPaths, getTvLogoPath } from "@masico/render";
import {
  menuExtractionResultSchema,
  type DeckManifest,
  type MenuExtractionResult
} from "@masico/shared";
import { runCommand, type RenderedSlide } from "./ffmpeg";

// TvComposition může být zkompilovaná klasickým JSX runtime (React.createElement)
// — React proto musí existovat globálně dřív, než se komponenta vyhodnotí.
(globalThis as { React?: typeof React }).React = React;

export type ChromiumRenderOptions = {
  /** Mapa assetId → lokální cesta staženého souboru (viz downloadDeckAssets). */
  assets?: ReadonlyMap<string, string>;
  /** Přepis binárky prohlížeče (testy); jinak se použije ensureBrowser(). */
  browserExecutable?: string;
  /** Timeout jednoho screenshotu; default 30 s. */
  screenshotTimeoutMs?: number;
};

const LOGO_WEB_PATH = "/brand/masico-logo.svg";
const LOGO_LOCAL_PATH = "./brand/masico-logo.svg";

/** Prázdné menu pro legacy manifesty bez menu snapshotu. */
const emptyMenu: MenuExtractionResult = menuExtractionResultSchema.parse({
  restaurant: {},
  date: null,
  sections: []
});

/**
 * Vyrenderuje slidy decku do PNG 1920×1080 přes Chrome Headless Shell —
 * stejný kontrakt jako renderDeckSlidesToPng (svg-slide-renderer).
 *
 * Postup: tempový web root (slides/NNN.html + assets/ + fonts/ + brand/),
 * HTML = renderToStaticMarkup(TvComposition) s bundlovanou Lorou, screenshot
 * per slide (concurrency 1, proces per slide), validace PNG IHDR.
 */
export async function renderDeckSlidesWithChromium(
  deck: DeckManifest,
  menu: MenuExtractionResult | null,
  framesDir: string,
  options: ChromiumRenderOptions = {}
): Promise<RenderedSlide[]> {
  const webRoot = await mkdtemp(join(tmpdir(), "masico-slides-"));

  try {
    const assets = options.assets ?? new Map<string, string>();
    const localDeck = withLocalAssetUrls(deck, assets);
    const resolvedMenu = menu ?? emptyMenu;
    const slides = [...deck.slides].sort((a, b) => a.sortOrder - b.sortOrder);

    await mkdir(join(webRoot, "slides"), { recursive: true });
    await mkdir(join(webRoot, "assets"), { recursive: true });
    await mkdir(join(webRoot, "fonts"), { recursive: true });
    await mkdir(join(webRoot, "brand"), { recursive: true });

    for (const font of getTvFontPaths()) {
      await copyFile(font.path, join(webRoot, "fonts", font.file));
    }
    await copyFile(getTvLogoPath(), join(webRoot, "brand", "masico-logo.svg"));
    for (const [assetId, localPath] of assets) {
      await copyFile(localPath, join(webRoot, "assets", `${assetId}.png`));
    }

    const browserPath = options.browserExecutable ?? (await resolveBrowserExecutable());
    const renderedSlides: RenderedSlide[] = [];

    for (const [index, slide] of slides.entries()) {
      const name = String(index + 1).padStart(3, "0");
      const htmlPath = join(webRoot, "slides", `${name}.html`);
      const pngPath = join(framesDir, `${name}.png`);

      await writeFile(htmlPath, buildSlideHtml(localDeck, resolvedMenu, slide.id), "utf8");
      await runCommand(
        browserPath,
        [
          "--headless",
          "--disable-gpu",
          "--no-sandbox",
          "--hide-scrollbars",
          "--force-device-scale-factor=1",
          "--window-size=1920,1080",
          "--virtual-time-budget=10000",
          `--screenshot=${pngPath}`,
          pathToFileURL(htmlPath).href
        ],
        { timeoutMs: options.screenshotTimeoutMs ?? 30_000 }
      );

      const { width, height } = await readPngDimensions(pngPath);
      if (width !== 1920 || height !== 1080) {
        throw new Error(`Slide ${name} rendered ${width}x${height}, expected 1920x1080.`);
      }

      renderedSlides.push({
        durationSeconds: slide.durationFrames / deck.fps,
        path: pngPath
      });
    }

    return renderedSlides;
  } finally {
    await rm(webRoot, { recursive: true, force: true });
  }
}

/**
 * Naklonuje deck s assetUrls přepsanými na lokální cesty web rootu
 * (`./assets/<assetId>.png`). Chybějící assety zůstanou bez URL —
 * ImageLayer v TvComposition vykreslí placeholder (logo na gradientu).
 */
export function withLocalAssetUrls(
  deck: DeckManifest,
  assets: ReadonlyMap<string, string>
): DeckManifest {
  const assetUrls: Record<string, string> = {};
  for (const assetId of assets.keys()) {
    assetUrls[assetId] = `./assets/${assetId}.png`;
  }

  return { ...deck, assetUrls };
}

/**
 * Kompletní HTML dokument jednoho slidu — 1:1 markup live playeru
 * (TvComposition) + bundlovaná Lora. `<base href="../">` nechává relativní
 * `./assets/`, `./fonts/` a `./brand/` cesty ukazovat do kořene web rootu,
 * i když HTML žije v podadresáři slides/.
 */
export function buildSlideHtml(
  deck: DeckManifest,
  menu: MenuExtractionResult,
  activeSlideId: string
): string {
  const markup = renderToStaticMarkup(
    createElement(TvComposition, { deck, menu, activeSlideId, showSafeArea: false })
  ).replaceAll(`"${LOGO_WEB_PATH}"`, `"${LOGO_LOCAL_PATH}"`);

  return [
    "<!DOCTYPE html>",
    '<html lang="cs">',
    "<head>",
    '<meta charset="utf-8">',
    '<base href="../">',
    "<title>MASI-CO slide</title>",
    "<style>",
    getTvFontFaceCss("./fonts/"),
    ":root { --font-lora: 'Lora'; }",
    "html, body { margin: 0; padding: 0; width: 1920px; height: 1080px; overflow: hidden; background: #000; }",
    "</style>",
    "</head>",
    "<body>",
    markup,
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

let browserExecutablePromise: Promise<string> | null = null;

/**
 * Zajistí Chrome Headless Shell přes @remotion/renderer (jednou per proces).
 * Při prvním běhu na stroji binárku stáhne do node_modules/.remotion.
 */
export function resolveBrowserExecutable(): Promise<string> {
  browserExecutablePromise ??= (async () => {
    const startedAt = Date.now();
    const status = await ensureBrowser();

    if (status.type !== "user-defined-path" && status.type !== "local-puppeteer-browser") {
      throw new Error(`Chrome Headless Shell is not available (ensureBrowser: ${status.type}).`);
    }

    console.log("Chrome Headless Shell ready", {
      path: status.path,
      source: status.type,
      elapsedMs: Date.now() - startedAt
    });

    return status.path;
  })();

  browserExecutablePromise.catch(() => {
    // Neúspěch necachovat — další job zkusí ensureBrowser znovu.
    browserExecutablePromise = null;
  });

  return browserExecutablePromise;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Přečte rozměry PNG přímo z IHDR chunku (bajty 16–23). */
export async function readPngDimensions(path: string) {
  const file = await open(path, "r");

  try {
    const header = Buffer.alloc(24);
    const { bytesRead } = await file.read(header, 0, 24, 0);

    if (bytesRead < 24 || !header.subarray(0, 8).equals(PNG_SIGNATURE)) {
      throw new Error(`File ${path} is not a valid PNG.`);
    }

    return {
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20)
    };
  } finally {
    await file.close();
  }
}
