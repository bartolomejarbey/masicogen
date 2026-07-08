import type {
  ImageLayerV2,
  LayerBinding,
  LayerFrame,
  LogoLayerV2,
  SectionKey,
  ShapeLayerV2,
  TemplateManifest,
  TemplateManifestV2,
  TextLayerV2
} from "./schemas";
import { brandTokens } from "./template-manifest";

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

// --- Denní smyčka MASI-CO: 6 šablon v2 s pozicovanými vrstvami ---

function itemBinding(
  sectionKey: SectionKey,
  index: number,
  field: "name" | "description" | "price" | "allergens" | "photo"
): LayerBinding {
  return { source: "item", sectionKey, index, field };
}

function text(
  id: string,
  frame: LayerFrame,
  options: Partial<Omit<TextLayerV2, "type" | "id" | "frame">> & { fontSizePx: number }
): TextLayerV2 {
  return {
    type: "text",
    id,
    frame,
    group: options.group ?? null,
    locked: options.locked ?? false,
    role: options.role ?? "item",
    binding: options.binding ?? null,
    text: options.text ?? null,
    color: options.color ?? brandTokens.ink,
    align: options.align ?? "left",
    fontSizePx: options.fontSizePx,
    fontWeight: options.fontWeight ?? 700,
    fontStyle: options.fontStyle ?? "normal",
    lineHeight: options.lineHeight ?? 1.1,
    maxLines: options.maxLines ?? 2,
    overflow: options.overflow ?? "truncate",
    uppercase: options.uppercase ?? false
  };
}

function image(
  id: string,
  frame: LayerFrame,
  options: Partial<Omit<ImageLayerV2, "type" | "id" | "frame">> = {}
): ImageLayerV2 {
  return {
    type: "image",
    id,
    frame,
    group: options.group ?? null,
    locked: options.locked ?? false,
    binding: options.binding ?? null,
    assetId: options.assetId ?? null,
    fit: options.fit ?? "cover",
    focalPoint: options.focalPoint ?? { x: 0.5, y: 0.5 },
    cornerRadius: options.cornerRadius ?? 0,
    overlay: options.overlay ?? "none",
    placeholder: options.placeholder ?? "dish"
  };
}

function shape(
  id: string,
  frame: LayerFrame,
  options: Partial<Omit<ShapeLayerV2, "type" | "id" | "frame">> & { fill: string }
): ShapeLayerV2 {
  return {
    type: "shape",
    id,
    frame,
    group: options.group ?? null,
    locked: options.locked ?? false,
    fill: options.fill,
    opacity: options.opacity ?? 1,
    cornerRadius: options.cornerRadius ?? 0
  };
}

function logo(id: string, frame: LayerFrame, variant: "red" | "white" = "red"): LogoLayerV2 {
  return { type: "logo", id, frame, group: null, locked: true, variant };
}

const dailyLoopRules = {
  minContrastRatio: 4.5,
  requireAllergenLegend: false,
  requirePhotos: "warn" as const,
  minFontSizePx: 30
};

const cornerLogo = logo("brand-logo", { x: 128, y: 72, w: 300, h: 88, zIndex: 6 });

/**
 * Nadpis sekce jako červená pilulka s bílými verzálkami — stejný prvek, jakým
 * tištěný jídelní lístek značí dny (PONDĚLÍ, ÚTERÝ…).
 */
function headlinePill(label: string, width = 560): Array<TextLayerV2 | ShapeLayerV2> {
  const x = Math.round((1920 - width) / 2);
  return [
    shape("headline-pill", { x, y: 84, w: width, h: 104, zIndex: 2 }, {
      fill: brandTokens.red,
      cornerRadius: 999
    }),
    text("headline", { x, y: 108, w: width, h: 62, zIndex: 3 }, {
      role: "headline",
      text: label,
      color: "#ffffff",
      align: "center",
      fontSizePx: 54,
      fontWeight: 700,
      lineHeight: 1,
      maxLines: 1,
      uppercase: true
    })
  ];
}

function soupCard(index: number): Array<TextLayerV2 | ImageLayerV2 | ShapeLayerV2> {
  const x = 128 + index * 864;
  const group = `soup-${index}`;
  return [
    shape(`soup-${index}-card`, { x, y: 240, w: 800, h: 760, zIndex: 1 }, {
      fill: brandTokens.cream,
      cornerRadius: 24,
      group
    }),
    image(`soup-${index}-photo`, { x, y: 240, w: 800, h: 460, zIndex: 2 }, {
      binding: itemBinding("soups", index, "photo"),
      cornerRadius: 24,
      group
    }),
    text(`soup-${index}-name`, { x: x + 36, y: 730, w: 728, h: 140, zIndex: 2 }, {
      binding: itemBinding("soups", index, "name"),
      color: brandTokens.red,
      fontSizePx: 52,
      fontWeight: 700,
      fontStyle: "italic",
      lineHeight: 1.12,
      maxLines: 2,
      group
    }),
    text(`soup-${index}-price`, { x: x + 36, y: 886, w: 380, h: 90, zIndex: 2 }, {
      role: "price",
      binding: itemBinding("soups", index, "price"),
      color: brandTokens.ink,
      fontSizePx: 60,
      fontWeight: 700,
      maxLines: 1,
      group
    }),
    text(`soup-${index}-allergens`, { x: x + 424, y: 906, w: 340, h: 64, zIndex: 2 }, {
      role: "note",
      binding: itemBinding("soups", index, "allergens"),
      color: brandTokens.red,
      align: "right",
      fontSizePx: 34,
      fontStyle: "italic",
      group
    })
  ];
}

function mainRow(index: number): Array<TextLayerV2 | ImageLayerV2> {
  const y = 190 + index * 164;
  const group = `main-${index}`;
  return [
    image(`main-${index}-photo`, { x: 128, y, w: 152, h: 152, zIndex: 2 }, {
      binding: itemBinding("mains", index, "photo"),
      cornerRadius: 16,
      group
    }),
    text(`main-${index}-name`, { x: 312, y: y + 4, w: 1080, h: 144, zIndex: 2 }, {
      binding: itemBinding("mains", index, "name"),
      fontSizePx: 44,
      fontWeight: 700,
      lineHeight: 1.1,
      maxLines: 2,
      group
    }),
    text(`main-${index}-allergens`, { x: 1400, y: y + 98, w: 240, h: 52, zIndex: 2 }, {
      role: "note",
      binding: itemBinding("mains", index, "allergens"),
      color: brandTokens.red,
      align: "right",
      fontSizePx: 32,
      fontStyle: "italic",
      group
    }),
    text(`main-${index}-price`, { x: 1420, y: y + 8, w: 372, h: 84, zIndex: 2 }, {
      role: "price",
      binding: itemBinding("mains", index, "price"),
      color: brandTokens.ink,
      align: "right",
      fontSizePx: 54,
      fontWeight: 700,
      maxLines: 1,
      group
    })
  ];
}

function buffetRow(index: number): Array<TextLayerV2 | ShapeLayerV2> {
  const y = 200 + index * 112;
  const group = `buffet-${index}`;
  const layers: Array<TextLayerV2 | ShapeLayerV2> = [
    text(`buffet-${index}-name`, { x: 168, y: y + 20, w: 1010, h: 72, zIndex: 3 }, {
      binding: itemBinding("buffet", index, "name"),
      fontSizePx: 46,
      fontWeight: 700,
      maxLines: 1,
      group
    }),
    text(`buffet-${index}-allergens`, { x: 1200, y: y + 34, w: 240, h: 56, zIndex: 3 }, {
      role: "note",
      binding: itemBinding("buffet", index, "allergens"),
      color: brandTokens.red,
      fontSizePx: 32,
      fontStyle: "italic",
      group
    }),
    text(`buffet-${index}-price`, { x: 1420, y: y + 20, w: 332, h: 72, zIndex: 3 }, {
      role: "price",
      binding: itemBinding("buffet", index, "price"),
      color: brandTokens.ink,
      align: "right",
      fontSizePx: 46,
      fontWeight: 700,
      maxLines: 1,
      group
    })
  ];

  // Střídavé lososové pruhy jako zvýrazněné řádky v tištěném lístku.
  if (index % 2 === 0) {
    layers.unshift(
      shape(`buffet-${index}-bar`, { x: 128, y, w: 1664, h: 104, zIndex: 1 }, {
        fill: brandTokens.salmon,
        opacity: 0.45,
        cornerRadius: 12,
        group
      })
    );
  }

  return layers;
}

function specialCard(index: number): Array<TextLayerV2 | ImageLayerV2 | ShapeLayerV2> {
  const x = 128 + index * 571;
  const group = `special-${index}`;
  return [
    shape(`special-${index}-card`, { x, y: 240, w: 522, h: 760, zIndex: 1 }, {
      fill: brandTokens.salmon,
      opacity: 0.5,
      cornerRadius: 24,
      group
    }),
    image(`special-${index}-photo`, { x, y: 240, w: 522, h: 320, zIndex: 2 }, {
      binding: itemBinding("special", index, "photo"),
      cornerRadius: 24,
      group
    }),
    text(`special-${index}-name`, { x: x + 28, y: 588, w: 466, h: 170, zIndex: 2 }, {
      binding: itemBinding("special", index, "name"),
      fontSizePx: 42,
      fontWeight: 700,
      lineHeight: 1.14,
      maxLines: 3,
      group
    }),
    text(`special-${index}-allergens`, { x: x + 28, y: 774, w: 466, h: 60, zIndex: 2 }, {
      role: "note",
      binding: itemBinding("special", index, "allergens"),
      color: brandTokens.red,
      fontSizePx: 32,
      fontStyle: "italic",
      group
    }),
    text(`special-${index}-price`, { x: x + 28, y: 856, w: 466, h: 90, zIndex: 2 }, {
      role: "price",
      binding: itemBinding("special", index, "price"),
      color: brandTokens.ink,
      fontSizePx: 54,
      fontWeight: 700,
      maxLines: 1,
      group
    })
  ];
}

export const dailyLoopTemplates: TemplateManifestV2[] = [
  {
    schemaVersion: 2,
    id: "masico-intro",
    name: "Denní menu — úvod",
    templateKind: "brand_intro",
    canvas,
    safeArea,
    backgroundColor: brandTokens.red,
    backgroundGradient: `linear-gradient(160deg, ${brandTokens.red} 0%, ${brandTokens.redDark} 100%)`,
    backgroundAssetId: null,
    durationFrames: 120,
    transition: "fade",
    layers: [
      logo("intro-logo", { x: 660, y: 280, w: 600, h: 220, zIndex: 2 }, "white"),
      text("intro-title", { x: 260, y: 560, w: 1400, h: 160, zIndex: 2 }, {
        role: "headline",
        text: "DENNÍ MENU",
        color: brandTokens.white,
        align: "center",
        fontSizePx: 120,
        fontWeight: 700,
        lineHeight: 1,
        maxLines: 1,
        uppercase: true,
        locked: true
      }),
      text("intro-date", { x: 260, y: 750, w: 1400, h: 70, zIndex: 2 }, {
        role: "subheadline",
        binding: { source: "menu", field: "date" },
        color: brandTokens.white,
        align: "center",
        fontSizePx: 48,
        fontWeight: 600,
        fontStyle: "italic",
        maxLines: 1,
        locked: true
      })
    ],
    validationRules: {
      ...dailyLoopRules,
      maxItemsPerSlide: 5,
      minItems: 0,
      maxItems: 5,
      requirePhotos: "off"
    }
  },
  {
    schemaVersion: 2,
    id: "soups-duo",
    name: "Polévky",
    templateKind: "soups_duo",
    canvas,
    safeArea,
    backgroundColor: brandTokens.paper,
    backgroundGradient: null,
    backgroundAssetId: null,
    durationFrames: 240,
    transition: "fade",
    layers: [cornerLogo, ...headlinePill("Polévky"), ...soupCard(0), ...soupCard(1)],
    validationRules: {
      ...dailyLoopRules,
      maxItemsPerSlide: 2,
      minItems: 1,
      maxItems: 2
    }
  },
  {
    schemaVersion: 2,
    id: "mains-grid",
    name: "Hlavní jídla",
    templateKind: "mains_grid",
    canvas,
    safeArea,
    backgroundColor: brandTokens.paper,
    backgroundGradient: null,
    backgroundAssetId: null,
    durationFrames: 420,
    transition: "fade",
    layers: [
      cornerLogo,
      ...headlinePill("Hlavní jídla", 640),
      ...mainRow(0),
      ...mainRow(1),
      ...mainRow(2),
      ...mainRow(3),
      ...mainRow(4)
    ],
    validationRules: {
      ...dailyLoopRules,
      maxItemsPerSlide: 5,
      minItems: 3,
      maxItems: 5
    }
  },
  {
    schemaVersion: 2,
    id: "pizza-day",
    name: "Pizza dne",
    templateKind: "pizza_day",
    canvas,
    safeArea,
    backgroundColor: brandTokens.paper,
    backgroundGradient: null,
    backgroundAssetId: null,
    durationFrames: 210,
    transition: "fade",
    layers: [
      cornerLogo,
      image("pizza-photo", { x: 1020, y: 72, w: 772, h: 936, zIndex: 1 }, {
        binding: itemBinding("pizza", 0, "photo"),
        cornerRadius: 24
      }),
      shape("pizza-kicker-pill", { x: 128, y: 236, w: 460, h: 96, zIndex: 2 }, {
        fill: brandTokens.red,
        cornerRadius: 999
      }),
      text("pizza-kicker", { x: 128, y: 258, w: 460, h: 58, zIndex: 3 }, {
        role: "subheadline",
        text: "PIZZA DNE",
        color: "#ffffff",
        align: "center",
        fontSizePx: 48,
        fontWeight: 700,
        lineHeight: 1,
        maxLines: 1,
        uppercase: true
      }),
      text("pizza-name", { x: 128, y: 380, w: 820, h: 270, zIndex: 2 }, {
        role: "headline",
        binding: itemBinding("pizza", 0, "name"),
        fontSizePx: 82,
        fontWeight: 700,
        lineHeight: 1.05,
        maxLines: 3
      }),
      text("pizza-description", { x: 128, y: 650, w: 820, h: 130, zIndex: 2 }, {
        role: "note",
        binding: itemBinding("pizza", 0, "description"),
        color: brandTokens.red,
        fontSizePx: 40,
        fontWeight: 600,
        fontStyle: "italic",
        lineHeight: 1.2,
        maxLines: 3
      }),
      shape("pizza-price-plate", { x: 128, y: 790, w: 360, h: 150, zIndex: 2 }, {
        fill: brandTokens.red,
        cornerRadius: 16
      }),
      text("pizza-price", { x: 148, y: 812, w: 320, h: 106, zIndex: 3 }, {
        role: "price",
        binding: itemBinding("pizza", 0, "price"),
        color: brandTokens.white,
        align: "center",
        fontSizePx: 84,
        fontWeight: 700,
        lineHeight: 1,
        maxLines: 1
      }),
      text("pizza-allergens", { x: 128, y: 956, w: 640, h: 52, zIndex: 2 }, {
        role: "note",
        binding: itemBinding("pizza", 0, "allergens"),
        color: brandTokens.red,
        fontSizePx: 34,
        fontStyle: "italic"
      })
    ],
    validationRules: {
      ...dailyLoopRules,
      maxItemsPerSlide: 1,
      minItems: 1,
      maxItems: 1
    }
  },
  {
    schemaVersion: 2,
    id: "hot-buffet",
    name: "Teplý bufet",
    templateKind: "hot_buffet",
    canvas,
    safeArea,
    backgroundColor: brandTokens.paper,
    backgroundGradient: null,
    backgroundAssetId: null,
    durationFrames: 300,
    transition: "fade",
    layers: [
      cornerLogo,
      ...headlinePill("Teplý bufet", 620),
      ...buffetRow(0),
      ...buffetRow(1),
      ...buffetRow(2),
      ...buffetRow(3),
      ...buffetRow(4),
      ...buffetRow(5),
      ...buffetRow(6)
    ],
    validationRules: {
      ...dailyLoopRules,
      maxItemsPerSlide: 7,
      minItems: 1,
      maxItems: 7,
      requirePhotos: "off"
    }
  },
  {
    schemaVersion: 2,
    id: "special-day",
    name: "Dnes navíc",
    templateKind: "special",
    canvas,
    safeArea,
    backgroundColor: brandTokens.paper,
    backgroundGradient: null,
    backgroundAssetId: null,
    durationFrames: 240,
    transition: "fade",
    layers: [
      cornerLogo,
      ...headlinePill("Dnes navíc", 600),
      ...specialCard(0),
      ...specialCard(1),
      ...specialCard(2)
    ],
    validationRules: {
      ...dailyLoopRules,
      maxItemsPerSlide: 3,
      minItems: 0,
      maxItems: 3,
      requirePhotos: "off"
    }
  }
];

export function getDailyLoopTemplate(id: string) {
  return dailyLoopTemplates.find((template) => template.id === id) ?? null;
}
