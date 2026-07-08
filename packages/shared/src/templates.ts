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

function headline(label: string): TextLayerV2 {
  return text("headline", { x: 128, y: 84, w: 1664, h: 104, zIndex: 2 }, {
    role: "headline",
    text: label,
    align: "center",
    fontSizePx: 84,
    fontWeight: 900,
    lineHeight: 1,
    maxLines: 1,
    uppercase: true
  });
}

function soupCard(index: number): Array<TextLayerV2 | ImageLayerV2 | ShapeLayerV2> {
  const x = 128 + index * 864;
  const group = `soup-${index}`;
  return [
    shape(`soup-${index}-card`, { x, y: 240, w: 800, h: 760, zIndex: 1 }, {
      fill: brandTokens.card,
      cornerRadius: 24,
      group
    }),
    image(`soup-${index}-photo`, { x, y: 240, w: 800, h: 460, zIndex: 2 }, {
      binding: itemBinding("soups", index, "photo"),
      cornerRadius: 24,
      group
    }),
    text(`soup-${index}-name`, { x: x + 32, y: 730, w: 736, h: 140, zIndex: 2 }, {
      binding: itemBinding("soups", index, "name"),
      fontSizePx: 54,
      fontWeight: 850,
      maxLines: 2,
      group
    }),
    text(`soup-${index}-price`, { x: x + 32, y: 884, w: 380, h: 90, zIndex: 2 }, {
      role: "price",
      binding: itemBinding("soups", index, "price"),
      color: brandTokens.red,
      fontSizePx: 64,
      fontWeight: 900,
      maxLines: 1,
      group
    }),
    text(`soup-${index}-allergens`, { x: x + 428, y: 900, w: 340, h: 64, zIndex: 2 }, {
      role: "note",
      binding: itemBinding("soups", index, "allergens"),
      align: "right",
      fontSizePx: 32,
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
      fontWeight: 850,
      lineHeight: 1.08,
      maxLines: 2,
      group
    }),
    text(`main-${index}-allergens`, { x: 1400, y: y + 96, w: 240, h: 52, zIndex: 2 }, {
      role: "note",
      binding: itemBinding("mains", index, "allergens"),
      align: "right",
      fontSizePx: 30,
      group
    }),
    text(`main-${index}-price`, { x: 1420, y: y + 8, w: 372, h: 84, zIndex: 2 }, {
      role: "price",
      binding: itemBinding("mains", index, "price"),
      color: brandTokens.red,
      align: "right",
      fontSizePx: 56,
      fontWeight: 900,
      maxLines: 1,
      group
    })
  ];
}

function buffetRow(index: number): TextLayerV2[] {
  const y = 200 + index * 112;
  const group = `buffet-${index}`;
  return [
    text(`buffet-${index}-name`, { x: 128, y, w: 1050, h: 104, zIndex: 2 }, {
      binding: itemBinding("buffet", index, "name"),
      fontSizePx: 48,
      fontWeight: 850,
      maxLines: 1,
      group
    }),
    text(`buffet-${index}-allergens`, { x: 1200, y: y + 26, w: 240, h: 56, zIndex: 2 }, {
      role: "note",
      binding: itemBinding("buffet", index, "allergens"),
      fontSizePx: 30,
      group
    }),
    text(`buffet-${index}-price`, { x: 1460, y, w: 332, h: 104, zIndex: 2 }, {
      role: "price",
      binding: itemBinding("buffet", index, "price"),
      color: brandTokens.red,
      align: "right",
      fontSizePx: 48,
      fontWeight: 900,
      maxLines: 1,
      group
    })
  ];
}

function specialCard(index: number): Array<TextLayerV2 | ImageLayerV2 | ShapeLayerV2> {
  const x = 128 + index * 571;
  const group = `special-${index}`;
  return [
    shape(`special-${index}-card`, { x, y: 240, w: 522, h: 760, zIndex: 1 }, {
      fill: brandTokens.card,
      cornerRadius: 24,
      group
    }),
    image(`special-${index}-photo`, { x, y: 240, w: 522, h: 320, zIndex: 2 }, {
      binding: itemBinding("special", index, "photo"),
      cornerRadius: 24,
      group
    }),
    text(`special-${index}-name`, { x: x + 24, y: 584, w: 474, h: 160, zIndex: 2 }, {
      binding: itemBinding("special", index, "name"),
      fontSizePx: 44,
      fontWeight: 850,
      maxLines: 3,
      group
    }),
    text(`special-${index}-allergens`, { x: x + 24, y: 764, w: 474, h: 60, zIndex: 2 }, {
      role: "note",
      binding: itemBinding("special", index, "allergens"),
      fontSizePx: 30,
      group
    }),
    text(`special-${index}-price`, { x: x + 24, y: 856, w: 474, h: 90, zIndex: 2 }, {
      role: "price",
      binding: itemBinding("special", index, "price"),
      color: brandTokens.red,
      fontSizePx: 54,
      fontWeight: 900,
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
        fontWeight: 900,
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
        fontWeight: 700,
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
    backgroundColor: brandTokens.cream,
    backgroundGradient: null,
    backgroundAssetId: null,
    durationFrames: 240,
    transition: "fade",
    layers: [cornerLogo, headline("Polévky"), ...soupCard(0), ...soupCard(1)],
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
    backgroundColor: brandTokens.cream,
    backgroundGradient: null,
    backgroundAssetId: null,
    durationFrames: 420,
    transition: "fade",
    layers: [
      cornerLogo,
      headline("Hlavní jídla"),
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
    backgroundColor: brandTokens.cream,
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
      text("pizza-kicker", { x: 128, y: 240, w: 820, h: 90, zIndex: 2 }, {
        role: "subheadline",
        text: "PIZZA DNE",
        color: brandTokens.red,
        fontSizePx: 72,
        fontWeight: 900,
        lineHeight: 1,
        maxLines: 1,
        uppercase: true
      }),
      text("pizza-name", { x: 128, y: 350, w: 820, h: 270, zIndex: 2 }, {
        role: "headline",
        binding: itemBinding("pizza", 0, "name"),
        fontSizePx: 84,
        fontWeight: 900,
        lineHeight: 1.02,
        maxLines: 3
      }),
      text("pizza-description", { x: 128, y: 630, w: 820, h: 130, zIndex: 2 }, {
        role: "note",
        binding: itemBinding("pizza", 0, "description"),
        color: "#4a443f",
        fontSizePx: 40,
        fontWeight: 650,
        lineHeight: 1.18,
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
        fontSizePx: 88,
        fontWeight: 900,
        lineHeight: 1,
        maxLines: 1
      }),
      text("pizza-allergens", { x: 128, y: 956, w: 640, h: 52, zIndex: 2 }, {
        role: "note",
        binding: itemBinding("pizza", 0, "allergens"),
        fontSizePx: 32
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
    backgroundColor: brandTokens.cream,
    backgroundGradient: null,
    backgroundAssetId: null,
    durationFrames: 300,
    transition: "fade",
    layers: [
      cornerLogo,
      headline("Teplý bufet"),
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
    backgroundColor: brandTokens.cream,
    backgroundGradient: null,
    backgroundAssetId: null,
    durationFrames: 240,
    transition: "fade",
    layers: [
      cornerLogo,
      headline("Dnes navíc"),
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
