import { z } from "zod";
import { allergenCodeSchema } from "./allergens";
import {
  focalPointSchema,
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

export const manualPresentationLayoutIds = [
  "mains-grid",
  "soups-duo",
  "pizza-day",
  "special-day"
] as const;

export type ManualPresentationLayoutId = (typeof manualPresentationLayoutIds)[number];

export const manualPresentationLayoutSchema = z.enum(manualPresentationLayoutIds);

export const manualPresentationLayouts: Array<{
  id: ManualPresentationLayoutId;
  label: string;
  description: string;
  sectionKey: SectionKey;
  capacity: number;
}> = [
  {
    id: "mains-grid",
    label: "Seznam jídel",
    description: "Až 5 jídel s malou volitelnou fotkou.",
    sectionKey: "mains",
    capacity: 5
  },
  {
    id: "soups-duo",
    label: "Dvě velké karty",
    description: "1–2 jídla s dominantní fotografií.",
    sectionKey: "soups",
    capacity: 2
  },
  {
    id: "pizza-day",
    label: "Jedno hlavní jídlo",
    description: "Jedna položka, velký název, cena a fotografie.",
    sectionKey: "pizza",
    capacity: 1
  },
  {
    id: "special-day",
    label: "Tři foto karty",
    description: "1–3 položky s volitelnými fotografiemi.",
    sectionKey: "special",
    capacity: 3
  }
];

export function getManualPresentationLayout(id: ManualPresentationLayoutId) {
  const layout = manualPresentationLayouts.find((candidate) => candidate.id === id);
  if (!layout) {
    throw new Error(`Unknown manual presentation layout: ${id}`);
  }
  return layout;
}

export const manualPresentationItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(280).default(""),
  priceCzk: z.number().int().nonnegative().max(1_000_000).nullable(),
  allergens: z.array(allergenCodeSchema).max(14).default([]),
  photoAssetId: z.string().uuid().nullable().default(null),
  photoFocalPoint: focalPointSchema.default({ x: 0.5, y: 0.5 }),
  photoSource: z.enum(["upload", "cutout", "ai"]).nullable().default(null)
});

export const manualPresentationSlideSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(140),
    baseTemplateId: manualPresentationLayoutSchema,
    durationSeconds: z.number().int().min(3).max(60).default(10),
    manifest: templateManifestV2Schema,
    items: z.array(manualPresentationItemSchema).min(1).max(7)
  })
  .superRefine((slide, context) => {
    const capacity = getManualPresentationLayout(slide.baseTemplateId).capacity;
    if (slide.items.length > capacity) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: `Rozložení dovoluje nejvýše ${capacity} položek.`
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

export type ManualPresentationItem = z.infer<typeof manualPresentationItemSchema>;
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
      minItems: 1
    }
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

  const sectionNames: Record<SectionKey, string> = {
    soups: "Karty",
    mains: "Nabídka",
    pizza: "Hlavní nabídka",
    buffet: "Bufet",
    special: "Speciální nabídka"
  };

  for (const slide of document.slides) {
    const { sectionKey } = getManualPresentationLayout(slide.baseTemplateId);
    const section = sections.get(sectionKey) ?? {
      id: sectionKey,
      name: sectionNames[sectionKey],
      items: []
    };

    for (const item of slide.items) {
      if (item.photoAssetId) {
        assetIds.add(item.photoAssetId);
      }
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
    sections.set(sectionKey, section);
    templateManifests[slide.manifest.id] = slide.manifest;
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
      menuItemIds: slide.items.map((item) => item.id),
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
      ...slide.items.map((item) => {
        const price = item.priceCzk === null ? "bez ceny" : `${item.priceCzk} Kč`;
        const allergens = item.allergens.length > 0 ? item.allergens.join(",") : "bez alergenů";
        return `${item.name} | ${price} | alergeny ${allergens}`;
      })
    ])
    .join("\n");
}
