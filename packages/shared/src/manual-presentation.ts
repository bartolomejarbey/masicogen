import { z } from "zod";
import { allergenCodeSchema } from "./allergens";
import {
  focalPointSchema,
  sectionKeySchema,
  templateManifestV2Schema,
  type DeckManifest,
  type MenuExtractionResult,
  type SectionKey,
  type TemplateManifestV2
} from "./schemas";
import { getDailyLoopTemplate } from "./templates";

export const MANUAL_PRESENTATION_SCHEMA_VERSION = 1 as const;
export const MANUAL_PRESENTATION_EDITOR_SOURCE = "masicogen-manual-presentation";
/** menu_versions.extraction_model ručních prezentací — denní tok tyto verze filtruje. */
export const MANUAL_PRESENTATION_EXTRACTION_MODEL = "manual-presentation";
export const MANUAL_PRESENTATION_MAX_SLIDES = 12;

/**
 * Ruční editor nabízí přesně ty slidy, které jezdí v denní smyčce
 * (dailyLoopTemplates) — žádná vlastní abstraktní rozložení. Každé rozložení
 * popisuje své sloty: skupiny položek tak, jak je slide skutečně kreslí.
 */
export const manualPresentationLayoutIds = [
  "masico-intro",
  "soups-duo",
  "mains-grid",
  "pizza-day",
  "hot-buffet",
  "special-day"
] as const;

export type ManualPresentationLayoutId = (typeof manualPresentationLayoutIds)[number];

export const manualPresentationLayoutSchema = z.enum(manualPresentationLayoutIds);

export type ManualPresentationSlotGroup = {
  sectionKey: SectionKey;
  /** Nadpis skupiny v editoru — odpovídá tomu, co je vidět na slidu. */
  label: string;
  /** Označení jedné kolonky, např. „Polévka" → „Polévka 1", „Polévka 2". */
  itemLabel: string;
  capacity: number;
  /** Má slide pro tuto skupinu fotografické vrstvy? */
  photo: boolean;
  /** Kreslí slide popis položky? (Jen pizza dne.) */
  description: boolean;
};

export type ManualPresentationLayout = {
  id: ManualPresentationLayoutId;
  label: string;
  description: string;
  slotGroups: ManualPresentationSlotGroup[];
};

export const manualPresentationLayouts: ManualPresentationLayout[] = [
  {
    id: "masico-intro",
    label: "Denní menu — přehled",
    description: "Celý den na jedné kartě: polévky, hlavní jídla a výhodné menu dne.",
    slotGroups: [
      { sectionKey: "soups", label: "Polévky", itemLabel: "Polévka", capacity: 2, photo: false, description: false },
      { sectionKey: "mains", label: "Hlavní jídla", itemLabel: "Hlavní jídlo", capacity: 5, photo: false, description: false },
      { sectionKey: "special", label: "Výhodné menu dne", itemLabel: "Menu dne", capacity: 1, photo: false, description: false }
    ]
  },
  {
    id: "soups-duo",
    label: "Polévky",
    description: "Dvě velké karty polévek s fotografií, cenou a alergeny.",
    slotGroups: [
      { sectionKey: "soups", label: "Polévky", itemLabel: "Polévka", capacity: 2, photo: true, description: false }
    ]
  },
  {
    id: "mains-grid",
    label: "Hlavní jídla",
    description: "Až pět hlavních jídel s malou fotkou, cenou a alergeny.",
    slotGroups: [
      { sectionKey: "mains", label: "Hlavní jídla", itemLabel: "Hlavní jídlo", capacity: 5, photo: true, description: false }
    ]
  },
  {
    id: "pizza-day",
    label: "Pizza dne",
    description: "Jedna pizza s velkou fotkou, popisem, cenou a alergeny.",
    slotGroups: [
      { sectionKey: "pizza", label: "Pizza dne", itemLabel: "Pizza", capacity: 1, photo: true, description: true }
    ]
  },
  {
    id: "hot-buffet",
    label: "Teplý bufet",
    description: "Až sedm položek bufetu s cenou a alergeny, bez fotek.",
    slotGroups: [
      { sectionKey: "buffet", label: "Teplý bufet", itemLabel: "Položka", capacity: 7, photo: false, description: false }
    ]
  },
  {
    id: "special-day",
    label: "Dnes navíc",
    description: "Až tři speciální nabídky s fotografiemi.",
    slotGroups: [
      { sectionKey: "special", label: "Dnes navíc", itemLabel: "Nabídka", capacity: 3, photo: true, description: false }
    ]
  }
];

const MAX_SLOTS_PER_SLIDE = Math.max(
  ...manualPresentationLayouts.map((layout) =>
    layout.slotGroups.reduce((total, group) => total + group.capacity, 0)
  )
);

export function getManualPresentationLayout(id: ManualPresentationLayoutId) {
  const layout = manualPresentationLayouts.find((candidate) => candidate.id === id);
  if (!layout) {
    throw new Error(`Unknown manual presentation layout: ${id}`);
  }
  return layout;
}

export const manualPresentationItemSchema = z.object({
  id: z.string().uuid(),
  /** Prázdný název = nevyplněná kolonka; slide ji schová a nikam se neukládá do menu. */
  name: z.string().trim().max(160).default(""),
  description: z.string().trim().max(280).default(""),
  priceCzk: z.number().int().nonnegative().max(1_000_000).nullable(),
  allergens: z.array(allergenCodeSchema).max(14).default([]),
  /** Do které skupiny slotů položka patří; starší dokumenty pole nemají → první skupina rozložení. */
  sectionKey: sectionKeySchema.optional(),
  photoAssetId: z.string().uuid().nullable().default(null),
  photoFocalPoint: focalPointSchema.default({ x: 0.5, y: 0.5 }),
  photoSource: z.enum(["upload", "cutout", "ai"]).nullable().default(null)
});

export type ManualPresentationItem = z.infer<typeof manualPresentationItemSchema>;

/** Skupina slotů, do které položka patří (staré dokumenty sectionKey nemají). */
export function manualItemSection(
  item: Pick<ManualPresentationItem, "sectionKey">,
  layout: ManualPresentationLayout
): SectionKey {
  return item.sectionKey ?? layout.slotGroups[0]!.sectionKey;
}

export function isBlankManualItem(item: Pick<ManualPresentationItem, "name">) {
  return item.name.trim().length === 0;
}

/** Položky slidu roztříděné do skupin slotů, v pořadí zápisu. */
export function manualSlideGroupItems(
  items: ManualPresentationItem[],
  layout: ManualPresentationLayout
): Map<SectionKey, ManualPresentationItem[]> {
  const groups = new Map<SectionKey, ManualPresentationItem[]>();
  for (const group of layout.slotGroups) {
    groups.set(group.sectionKey, []);
  }
  for (const item of items) {
    const key = manualItemSection(item, layout);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(item);
    }
  }
  return groups;
}

/** Prázdná kolonka pro daný slot. */
export function createManualPresentationItem(sectionKey: SectionKey): ManualPresentationItem {
  return {
    id: crypto.randomUUID(),
    name: "",
    description: "",
    priceCzk: null,
    allergens: [],
    sectionKey,
    photoAssetId: null,
    photoFocalPoint: { x: 0.5, y: 0.5 },
    photoSource: null
  };
}

/** Plná sada prázdných kolonek podle slotů rozložení. */
export function createManualPresentationSlideItems(
  layoutId: ManualPresentationLayoutId
): ManualPresentationItem[] {
  return getManualPresentationLayout(layoutId).slotGroups.flatMap((group) =>
    Array.from({ length: group.capacity }, () => createManualPresentationItem(group.sectionKey))
  );
}

/**
 * Doplní slidu chybějící kolonky do plného počtu slotů (starší dokumenty
 * ukládaly jen vyplněné položky) a ořízne přebytek nad kapacitu skupin.
 */
export function padManualSlideItems(
  items: ManualPresentationItem[],
  layoutId: ManualPresentationLayoutId
): ManualPresentationItem[] {
  const layout = getManualPresentationLayout(layoutId);
  const groups = manualSlideGroupItems(items, layout);
  return layout.slotGroups.flatMap((group) => {
    const existing = (groups.get(group.sectionKey) ?? []).slice(0, group.capacity);
    const missing = group.capacity - existing.length;
    return [
      ...existing.map((item) => ({ ...item, sectionKey: group.sectionKey })),
      ...Array.from({ length: missing }, () => createManualPresentationItem(group.sectionKey))
    ];
  });
}

export const manualPresentationSlideSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(140),
    baseTemplateId: manualPresentationLayoutSchema,
    durationSeconds: z.number().int().min(3).max(60).default(10),
    manifest: templateManifestV2Schema,
    items: z.array(manualPresentationItemSchema).min(1).max(MAX_SLOTS_PER_SLIDE)
  })
  .superRefine((slide, context) => {
    const layout = getManualPresentationLayout(slide.baseTemplateId);
    const allowed = new Set(layout.slotGroups.map((group) => group.sectionKey));
    const counts = new Map<SectionKey, number>();
    let filled = 0;

    slide.items.forEach((item, itemIndex) => {
      const key = manualItemSection(item, layout);
      if (!allowed.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["items", itemIndex, "sectionKey"],
          message: "Položka nepatří do žádné skupiny tohoto rozložení."
        });
        return;
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!isBlankManualItem(item)) {
        filled += 1;
      }
    });

    for (const group of layout.slotGroups) {
      if ((counts.get(group.sectionKey) ?? 0) > group.capacity) {
        context.addIssue({
          code: "custom",
          path: ["items"],
          message: `Skupina „${group.label}" dovoluje nejvýše ${group.capacity} položek.`
        });
      }
    }

    if (filled === 0) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Vyplňte alespoň jedno jídlo na slidu."
      });
    }
  });

export const manualPresentationDocumentSchema = z
  .object({
    schemaVersion: z.literal(MANUAL_PRESENTATION_SCHEMA_VERSION),
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(140),
    presentationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    locationId: z.string().uuid(),
    canteenId: z.string().uuid(),
    slides: z
      .array(manualPresentationSlideSchema)
      .min(1)
      .max(MANUAL_PRESENTATION_MAX_SLIDES)
  })
  .superRefine((document, context) => {
    const slideIds = new Set<string>();
    const manifestIds = new Set<string>();
    const itemIds = new Set<string>();

    document.slides.forEach((slide, slideIndex) => {
      if (slideIds.has(slide.id)) {
        context.addIssue({
          code: "custom",
          path: ["slides", slideIndex, "id"],
          message: "Každý slide musí mít vlastní ID."
        });
      }
      slideIds.add(slide.id);

      if (slide.manifest.id !== `manual-${slide.id}`) {
        context.addIssue({
          code: "custom",
          path: ["slides", slideIndex, "manifest", "id"],
          message: "Šablona slidu neodpovídá jeho ID."
        });
      }

      if (manifestIds.has(slide.manifest.id)) {
        context.addIssue({
          code: "custom",
          path: ["slides", slideIndex, "manifest", "id"],
          message: "Každý slide musí mít vlastní šablonu."
        });
      }
      manifestIds.add(slide.manifest.id);

      slide.items.forEach((item, itemIndex) => {
        if (itemIds.has(item.id)) {
          context.addIssue({
            code: "custom",
            path: ["slides", slideIndex, "items", itemIndex, "id"],
            message: "Každá položka musí mít vlastní ID."
          });
        }
        itemIds.add(item.id);
      });
    });
  });

export type ManualPresentationSlide = z.infer<typeof manualPresentationSlideSchema>;
export type ManualPresentationDocument = z.infer<typeof manualPresentationDocumentSchema>;

export type ManualPresentationRenderModel = {
  deck: DeckManifest;
  menu: MenuExtractionResult;
};

export function createManualPresentationManifest(
  baseTemplateId: ManualPresentationLayoutId,
  slideId: string
): TemplateManifestV2 {
  const template = getDailyLoopTemplate(baseTemplateId);
  if (!template) {
    throw new Error(`Missing base template: ${baseTemplateId}`);
  }

  const manifest = templateManifestV2Schema.parse(template);
  return {
    ...manifest,
    id: `manual-${slideId}`,
    name: `Ruční slide · ${manifest.name}`,
    validationRules: {
      ...manifest.validationRules,
      minItems: 0
    }
  };
}

const manualSectionNames: Record<SectionKey, string> = {
  soups: "Polévky",
  mains: "Hlavní jídla",
  pizza: "Pizza dne",
  buffet: "Teplý bufet",
  special: "Dnes navíc"
};

/**
 * No-photo layout „naší" šablony: pro slidy bez fotek jídel schová foto
 * vrstvy a text přeskládá tak, aby po fotce nezůstalo prázdné místo ani
 * placeholder — design zůstává stejný, jen bez fotek.
 *  - Hlavní jídla: název jídla se roztáhne na místo po fotce (čistý seznam).
 *  - Polévky: karta se změní na textovou (velký název, výrazná cena, alergeny).
 */
function applyNoPhotoLayout(
  manifest: TemplateManifestV2,
  layoutId: ManualPresentationLayoutId
): TemplateManifestV2 {
  if (layoutId !== "mains-grid" && layoutId !== "soups-duo") {
    return manifest;
  }
  return {
    ...manifest,
    layers: manifest.layers.map((layer) => {
      if (
        layer.type === "image" &&
        layer.binding?.source === "item" &&
        layer.binding.field === "photo"
      ) {
        return { ...layer, placeholder: "none" as const };
      }
      if (layoutId === "mains-grid" && layer.type === "text" && /^main-\d+-name$/.test(layer.id)) {
        return { ...layer, frame: { ...layer.frame, x: 128, w: 1264 } };
      }
      if (layoutId === "soups-duo") {
        if (layer.type === "shape" && /^soup-\d+-card$/.test(layer.id)) {
          return { ...layer, frame: { ...layer.frame, y: 288, h: 504 } };
        }
        if (layer.type === "text" && /^soup-\d+-name$/.test(layer.id)) {
          return { ...layer, fontSizePx: 58, maxLines: 3, frame: { ...layer.frame, y: 350, h: 240 } };
        }
        if (layer.type === "text" && /^soup-\d+-price$/.test(layer.id)) {
          return { ...layer, fontSizePx: 68, frame: { ...layer.frame, y: 648, h: 90 } };
        }
        if (layer.type === "text" && /^soup-\d+-allergens$/.test(layer.id)) {
          return { ...layer, fontSizePx: 40, frame: { ...layer.frame, y: 668, h: 60 } };
        }
      }
      return layer;
    })
  };
}

export function buildManualPresentationRenderModel(
  rawDocument: ManualPresentationDocument,
  options: {
    orgId?: string;
    deckId?: string;
    menuVersionId?: string;
    assetUrls?: Record<string, string>;
  } = {}
): ManualPresentationRenderModel {
  const document = manualPresentationDocumentSchema.parse(rawDocument);
  const sections = new Map<SectionKey, MenuExtractionResult["sections"][number]>();
  const templateManifests: Record<string, TemplateManifestV2> = {};
  const assetIds = new Set<string>();
  const menuItemIdsBySlide = new Map<string, string[]>();

  for (const slide of document.slides) {
    const layout = getManualPresentationLayout(slide.baseTemplateId);
    const groups = manualSlideGroupItems(slide.items, layout);
    const slideItemIds: string[] = [];

    for (const group of layout.slotGroups) {
      // Prázdné kolonky se do menu nedostanou — TvComposition schová jejich
      // sloty a viditelné položky převystředí.
      const filled = (groups.get(group.sectionKey) ?? []).filter(
        (item) => !isBlankManualItem(item)
      );
      if (filled.length === 0) {
        continue;
      }

      const section = sections.get(group.sectionKey) ?? {
        id: group.sectionKey,
        name: manualSectionNames[group.sectionKey],
        items: []
      };

      for (const item of filled) {
        if (item.photoAssetId) {
          assetIds.add(item.photoAssetId);
        }
        slideItemIds.push(item.id);
        section.items.push({
          id: item.id,
          name: item.name,
          description: item.description || null,
          prices: [{ label: "porce", amount: item.priceCzk, currency: "CZK" }],
          allergens: item.allergens,
          allergensUnknown: false,
          dietaryTags: [],
          modifiers: [],
          available: true,
          highlight: false,
          photoAssetId: item.photoAssetId,
          photoFocalPoint: item.photoFocalPoint,
          photoSource: item.photoAssetId ? item.photoSource ?? "upload" : undefined,
          sourceRefs: [],
          confidence: 1
        });
      }
      sections.set(group.sectionKey, section);
    }

    // Slide bez jediné fotky = čistý no-photo layout (žádné prázdné foto
    // plochy ani placeholdery). Se snímky zůstává původní layout beze změny.
    const slideHasPhoto = slide.items.some(
      (item) => !isBlankManualItem(item) && item.photoAssetId
    );
    menuItemIdsBySlide.set(slide.id, slideItemIds);
    templateManifests[slide.manifest.id] = slideHasPhoto
      ? slide.manifest
      : applyNoPhotoLayout(slide.manifest, slide.baseTemplateId);
  }

  const allAssetIds = [...assetIds];
  const assetUrls = Object.fromEntries(
    allAssetIds.flatMap((assetId) => {
      const url = options.assetUrls?.[assetId];
      return url ? [[assetId, url]] : [];
    })
  );

  const menu: MenuExtractionResult = {
    restaurant: { name: "MASI-CO food", locale: "cs-CZ", currency: "CZK" },
    date: document.presentationDate,
    locationName: null,
    sections: [...sections.values()],
    warnings: []
  };

  const deck: DeckManifest = {
    id: options.deckId ?? document.id,
    orgId: options.orgId ?? "00000000-0000-4000-8000-000000000001",
    locationId: document.locationId,
    canteenId: document.canteenId,
    menuVersionId: options.menuVersionId ?? "manual-editor-preview",
    status: "draft",
    fps: 30,
    canvas: { width: 1920, height: 1080, aspectRatio: "16:9" },
    slides: document.slides.map((slide, index) => ({
      id: slide.id,
      templateId: slide.manifest.id,
      title: slide.title,
      menuSectionIds: [],
      menuItemIds: menuItemIdsBySlide.get(slide.id) ?? [],
      backgroundAssetId: slide.manifest.backgroundAssetId,
      durationFrames: slide.durationSeconds * 30,
      sortOrder: index + 1
    })),
    templateVersionIds: [],
    templateManifests,
    assetIds: allAssetIds,
    assetUrls,
    rendererVersion: "manual-presentation-1"
  };

  return { deck, menu };
}

export function manualPresentationSourceText(document: ManualPresentationDocument) {
  const parsed = manualPresentationDocumentSchema.parse(document);
  return parsed.slides
    .flatMap((slide, slideIndex) => [
      `SLIDE ${slideIndex + 1}: ${slide.title}`,
      ...slide.items
        .filter((item) => !isBlankManualItem(item))
        .map((item) => {
          const price = item.priceCzk === null ? "bez ceny" : `${item.priceCzk} Kč`;
          const allergens = item.allergens.length > 0 ? item.allergens.join(",") : "bez alergenů";
          return `${item.name} | ${price} | alergeny ${allergens}`;
        })
    ])
    .join("\n");
}
