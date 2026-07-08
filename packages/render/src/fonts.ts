import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Bundlované TV fonty (Lora, SIL OFL — viz assets/fonts/OFL.txt) a brand
 * assety pro render mimo web appku (worker MP4 export). Cesty se odvozují
 * od tohoto souboru, takže fungují z libovolného workspace balíčku.
 */
const assetsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");

export type TvFontFile = {
  family: "Lora";
  style: "normal" | "italic";
  /** CSS rozsah vah variabilního fontu. */
  weight: "400 700";
  /** Název souboru (pro kopii do web rootu). */
  file: string;
  /** Absolutní cesta k TTF v packages/render/assets/fonts. */
  path: string;
};

export function getTvFontPaths(): TvFontFile[] {
  return [
    {
      family: "Lora",
      style: "normal",
      weight: "400 700",
      file: "Lora.ttf",
      path: join(assetsDir, "fonts", "Lora.ttf")
    },
    {
      family: "Lora",
      style: "italic",
      weight: "400 700",
      file: "Lora-Italic.ttf",
      path: join(assetsDir, "fonts", "Lora-Italic.ttf")
    }
  ];
}

/** Absolutní cesta k bundlovanému logu MASI-CO (kopie apps/web/public/brand). */
export function getTvLogoPath(): string {
  return join(assetsDir, "brand", "masico-logo.svg");
}

/**
 * @font-face bloky pro TV render. `font-display: block` — screenshot nesmí
 * proběhnout s fallback fontem.
 */
export function getTvFontFaceCss(urlPrefix = "./fonts/"): string {
  return getTvFontPaths()
    .map((font) =>
      [
        "@font-face {",
        `  font-family: '${font.family}';`,
        `  src: url('${urlPrefix}${font.file}') format('truetype');`,
        `  font-weight: ${font.weight};`,
        `  font-style: ${font.style};`,
        "  font-display: block;",
        "}"
      ].join("\n")
    )
    .join("\n");
}
