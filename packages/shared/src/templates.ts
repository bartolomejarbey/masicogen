import type { TemplateManifest } from "./schemas";

const canvas = {
  width: 1920,
  height: 1080,
  aspectRatio: "16:9" as const
} as const;

const safeArea = {
  x: 128,
  y: 72,
  width: 1664,
  height: 936
};

const baseRules = {
  minContrastRatio: 4.5,
  maxItemsPerSlide: 5,
  requireAllergenLegend: true
};

export const defaultTemplateManifests: TemplateManifest[] = [
  {
    id: "daily-menu",
    name: "Denní menu",
    templateKind: "daily_menu",
    canvas,
    safeArea,
    backgroundAssetId: null,
    durationFrames: 270,
    transition: "fade",
    textLayers: [
      {
        id: "headline",
        role: "headline",
        binding: "menu.date",
        text: "Dnešní menu",
        styleId: "headline",
        maxLines: 1,
        overflow: "block"
      },
      {
        id: "items",
        role: "item",
        binding: "menu.items",
        text: null,
        styleId: "menuItem",
        maxLines: 5,
        overflow: "split"
      }
    ],
    validationRules: baseRules
  },
  {
    id: "soup-mains",
    name: "Polévka + hlavní jídla",
    templateKind: "soup_mains",
    canvas,
    safeArea,
    backgroundAssetId: null,
    durationFrames: 240,
    transition: "fade",
    textLayers: [
      {
        id: "soup",
        role: "item",
        binding: "section.soup",
        text: "Polévka",
        styleId: "section",
        maxLines: 2,
        overflow: "block"
      },
      {
        id: "mains",
        role: "item",
        binding: "section.mains",
        text: "Hlavní jídla",
        styleId: "menuItem",
        maxLines: 4,
        overflow: "split"
      }
    ],
    validationRules: baseRules
  },
  {
    id: "special-offer",
    name: "Special nabídka",
    templateKind: "special",
    canvas,
    safeArea,
    backgroundAssetId: null,
    durationFrames: 270,
    transition: "fade",
    textLayers: [
      {
        id: "headline",
        role: "headline",
        binding: "slide.title",
        text: "Special menu",
        styleId: "hero",
        maxLines: 2,
        overflow: "block"
      }
    ],
    validationRules: { ...baseRules, maxItemsPerSlide: 3 }
  },
  {
    id: "promo",
    name: "Promo / akce",
    templateKind: "promo",
    canvas,
    safeArea,
    backgroundAssetId: null,
    durationFrames: 210,
    transition: "fade",
    textLayers: [
      {
        id: "headline",
        role: "headline",
        binding: "promo.headline",
        text: "Akce",
        styleId: "promo",
        maxLines: 2,
        overflow: "block"
      }
    ],
    validationRules: { ...baseRules, requireAllergenLegend: false }
  },
  {
    id: "sold-out",
    name: "Vyprodáno / změna nabídky",
    templateKind: "sold_out",
    canvas,
    safeArea,
    backgroundAssetId: null,
    durationFrames: 180,
    transition: "fade",
    textLayers: [
      {
        id: "headline",
        role: "headline",
        binding: "notice.headline",
        text: "Změna nabídky",
        styleId: "alert",
        maxLines: 2,
        overflow: "block"
      }
    ],
    validationRules: { ...baseRules, requireAllergenLegend: false }
  },
  {
    id: "info",
    name: "Otevírací doba / info",
    templateKind: "info",
    canvas,
    safeArea,
    backgroundAssetId: null,
    durationFrames: 210,
    transition: "fade",
    textLayers: [
      {
        id: "info",
        role: "note",
        binding: "location.info",
        text: "Otevírací doba",
        styleId: "info",
        maxLines: 4,
        overflow: "block"
      }
    ],
    validationRules: { ...baseRules, requireAllergenLegend: false }
  },
  {
    id: "allergen-legend",
    name: "Alergenová legenda",
    templateKind: "allergen_legend",
    canvas,
    safeArea,
    backgroundAssetId: null,
    durationFrames: 300,
    transition: "fade",
    textLayers: [
      {
        id: "legend",
        role: "legend",
        binding: "allergens.legend",
        text: null,
        styleId: "legend",
        maxLines: 14,
        overflow: "block"
      }
    ],
    validationRules: { ...baseRules, requireAllergenLegend: false }
  }
];
