import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Bundlované TV fonty (Lora, SIL OFL — viz assets/fonts/OFL.txt) a brand
 * assety pro render mimo web appku (worker MP4 export). Cesty se odvozují
 * od tohoto souboru, takže fungují z libovolného workspace balíčku.
 *
 * POZOR: `fileURLToPath` je Node-only. Tenhle modul se přes `@masico/render`
 * (TvComposition) dostane i do prohlížeče, kde je `fileURLToPath` undefined.
 * Kdyby se volal na úrovni modulu, spadl by CELÝ klientský render (viděli
 * jsme „Stránka se nenačetla" v Safari). Proto se cesta k assetům počítá
 * LÍNĚ, jen když si o filesystémovou cestu řekne worker — klient volá jen
 * `getTvFontFaceCss`, který žádný filesystem nepotřebuje.
 */
function getAssetsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
}

/** Metadata fontů bez filesystémové cesty — bezpečné i v prohlížeči. */
const TV_FONT_META = [
  { family: "Lora", style: "normal", weight: "400 700", file: "Lora.ttf" },
  { family: "Lora", style: "italic", weight: "400 700", file: "Lora-Italic.ttf" }
] as const;

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
  const assetsDir = getAssetsDir();
  return TV_FONT_META.map((font) => ({
    ...font,
    path: join(assetsDir, "fonts", font.file)
  }));
}

/** Absolutní cesta k bundlovanému logu MASI-CO (kopie apps/web/public/brand). */
export function getTvLogoPath(): string {
  return join(getAssetsDir(), "brand", "masico-logo.svg");
}

/**
 * @font-face bloky pro TV render. `font-display: block` — screenshot nesmí
 * proběhnout s fallback fontem.
 */
export function getTvFontFaceCss(urlPrefix = "./fonts/"): string {
  return TV_FONT_META
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
