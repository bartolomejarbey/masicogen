import type {
  AnyTemplateManifest,
  TemplateLayerV2,
  TemplateManifest,
  TemplateManifestV2
} from "./schemas";

export const brandTokens = {
  red: "#cc1939",
  redDark: "#941414",
  ink: "#191513",
  cream: "#f6f3ee",
  card: "#fffdf9",
  paper: "#ffffff",
  salmon: "#f6a9a2",
  border: "#e2d9cf",
  white: "#fffaf0"
} as const;

/** Serif podle tištěného jídelního lístku MASI-CO (Lora se načítá ve web appce). */
export const tvFontFamily =
  'var(--font-lora, "Lora"), "Lora", Georgia, "Times New Roman", serif';

export function isTemplateManifestV2(
  manifest: AnyTemplateManifest
): manifest is TemplateManifestV2 {
  return "schemaVersion" in manifest && manifest.schemaVersion === 2;
}

/**
 * Převede libovolný manifest na v2. Manifesty v1 v databázi jsou immutable,
 * proto se migrace děje výhradně při čtení; vrstvy aproximují dosavadní
 * zadrátovaný layout TvComposition (slouží jako výchozí bod pro editor).
 */
export function normalizeManifest(manifest: AnyTemplateManifest): TemplateManifestV2 {
  if (isTemplateManifestV2(manifest)) {
    return manifest;
  }

  return {
    schemaVersion: 2,
    id: manifest.id,
    name: manifest.name,
    templateKind: manifest.templateKind,
    canvas: manifest.canvas,
    safeArea: manifest.safeArea,
    backgroundColor: brandTokens.cream,
    backgroundGradient: "linear-gradient(120deg, #fbfaf6 0%, #fff 46%, #f1e6d5 100%)",
    backgroundAssetId: manifest.backgroundAssetId,
    durationFrames: manifest.durationFrames,
    transition: manifest.transition,
    layers: legacyLayersFor(manifest),
    validationRules: {
      minContrastRatio: manifest.validationRules.minContrastRatio,
      maxItemsPerSlide: manifest.validationRules.maxItemsPerSlide,
      requireAllergenLegend: manifest.validationRules.requireAllergenLegend,
      minItems: 0,
      maxItems: manifest.validationRules.maxItemsPerSlide,
      requirePhotos: "off",
      minFontSizePx: 30
    }
  };
}

function legacyLayersFor(manifest: TemplateManifest): TemplateLayerV2[] {
  const layers: TemplateLayerV2[] = [
    {
      type: "text",
      id: "headline",
      frame: { x: 128, y: 96, w: 1664, h: 110, zIndex: 2 },
      group: null,
      locked: false,
      role: "headline",
      binding: { source: "menu", field: "title" },
      text: manifest.name,
      color: brandTokens.ink,
      align: "left",
      fontSizePx: 92,
      fontWeight: 900,
      fontStyle: "normal",
      lineHeight: 1,
      maxLines: 1,
      overflow: "truncate",
      uppercase: false
    }
  ];

  const rowCount = Math.min(manifest.validationRules.maxItemsPerSlide, 5);
  for (let index = 0; index < rowCount; index += 1) {
    const y = 280 + index * 140;
    layers.push(
      {
        type: "text",
        id: `item-${index}-name`,
        frame: { x: 128, y, w: 1300, h: 120, zIndex: 2 },
        group: `item-${index}`,
        locked: false,
        role: "item",
        binding: { source: "item", sectionKey: "mains", index, field: "name" },
        text: null,
        color: brandTokens.ink,
        align: "left",
        fontSizePx: 52,
        fontWeight: 850,
        fontStyle: "normal",
        lineHeight: 1.08,
        maxLines: 2,
        overflow: "truncate",
        uppercase: false
      },
      {
        type: "text",
        id: `item-${index}-price`,
        frame: { x: 1452, y, w: 340, h: 120, zIndex: 2 },
        group: `item-${index}`,
        locked: false,
        role: "price",
        binding: { source: "item", sectionKey: "mains", index, field: "price" },
        text: null,
        color: brandTokens.ink,
        align: "right",
        fontSizePx: 54,
        fontWeight: 900,
        fontStyle: "normal",
        lineHeight: 1,
        maxLines: 1,
        overflow: "truncate",
        uppercase: false
      }
    );
  }

  return layers;
}
