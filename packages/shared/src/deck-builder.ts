import type {
  ApprovalStatus,
  DeckManifest,
  MenuExtractionResult,
  SectionKey,
  Slide,
  TemplateManifestV2
} from "./schemas";
import { dailyLoopTemplates } from "./templates";

export const TV_FPS = 30;
export const SLIDE_MIN_DURATION_SECONDS = 3;
export const SLIDE_MAX_DURATION_SECONDS = 60;

export function clampSlideDurationSeconds(seconds: number) {
  return Math.min(
    Math.max(Math.round(seconds), SLIDE_MIN_DURATION_SECONDS),
    SLIDE_MAX_DURATION_SECONDS
  );
}

export function secondsToFrames(seconds: number) {
  return clampSlideDurationSeconds(seconds) * TV_FPS;
}

export function framesToSeconds(frames: number) {
  return Math.round(frames / TV_FPS);
}

export type DailyLoopSlideKey = "intro" | "soups" | "mains" | "pizza" | "buffet" | "special";

export const dailyLoopSlides: Array<{
  key: DailyLoopSlideKey;
  templateId: string;
  sectionKey: SectionKey | null;
  optional: boolean;
}> = [
  { key: "intro", templateId: "masico-intro", sectionKey: null, optional: false },
  { key: "soups", templateId: "soups-duo", sectionKey: "soups", optional: false },
  { key: "mains", templateId: "mains-grid", sectionKey: "mains", optional: false },
  { key: "pizza", templateId: "pizza-day", sectionKey: "pizza", optional: true },
  { key: "buffet", templateId: "hot-buffet", sectionKey: "buffet", optional: true },
  { key: "special", templateId: "special-day", sectionKey: "special", optional: true }
];

const sectionAliases: Record<SectionKey, RegExp> = {
  soups: /pol[ée]vk|soup/i,
  mains: /hlavn|menu|j[ií]dla/i,
  pizza: /pizza/i,
  buffet: /bufet|buffet/i,
  special: /special|dezert|akce|nav[ií]c|mou[cč]n/i
};

const sectionIdAliases: Record<string, SectionKey> = {
  soups: "soups",
  mains: "mains",
  pizza: "pizza",
  buffet: "buffet",
  special: "special",
  specials: "special",
  desserts: "special"
};

export function resolveSectionByKey(menu: MenuExtractionResult, key: SectionKey) {
  const byId = menu.sections.find((section) => sectionIdAliases[section.id] === key);
  if (byId) {
    return byId;
  }

  return (
    menu.sections.find(
      (section) => !(section.id in sectionIdAliases) && sectionAliases[key].test(section.name)
    ) ?? null
  );
}

export type DailyDeckOptions = {
  deckId?: string;
  orgId?: string;
  locationId?: string;
  canteenId?: string;
  menuVersionId?: string;
  status?: ApprovalStatus;
  rendererVersion?: string;
  templates?: TemplateManifestV2[];
  templateVersionIds?: Record<string, string>;
  /** Délka jednotlivých slidů v sekundách; nevyplněné slidy dostanou výchozí délku ze šablony. */
  slideDurationsSeconds?: Partial<Record<DailyLoopSlideKey, number>>;
  /** Vypnutí volitelných slidů z nastavení organizace (false = slide se nestaví). */
  enabledSlides?: Partial<Record<DailyLoopSlideKey, boolean>>;
  /** Text legendy alergenů ve footeru — personalizace z nastavení organizace. */
  footerLegendText?: string;
};

export function buildDailyDeckManifest(
  menu: MenuExtractionResult,
  options: DailyDeckOptions = {}
): DeckManifest {
  const templates = options.templates ?? dailyLoopTemplates;
  const slides: Slide[] = [];
  const templateManifests: Record<string, TemplateManifestV2> = {};
  const assetIds = new Set<string>();

  for (const definition of dailyLoopSlides) {
    // Povinné slidy (přehled, polévky, hlavní jídla) nelze vypnout ani přes
    // API — UI to sice hlídá, ale settings patch může přijít odkudkoli.
    if (definition.optional && options.enabledSlides?.[definition.key] === false) {
      continue;
    }

    const sourceTemplate = templates.find((candidate) => candidate.id === definition.templateId);
    if (!sourceTemplate) {
      continue;
    }

    // Klon: manifest jde do decku i do editovatelných přepisů — sdílená
    // reference by nechala pozdější mutace prosakovat do dailyLoopTemplates.
    const template = structuredClone(sourceTemplate);

    if (options.footerLegendText) {
      for (const layer of template.layers) {
        if (layer.type === "text" && layer.id === "brand-footer-text") {
          layer.text = options.footerLegendText;
        }
      }
    }

    const section = definition.sectionKey
      ? resolveSectionByKey(menu, definition.sectionKey)
      : null;
    const items = section
      ? section.items
          .filter((item) => item.available)
          .slice(0, template.validationRules.maxItems)
      : [];

    if (definition.sectionKey && items.length === 0) {
      continue;
    }

    const durationSeconds = options.slideDurationsSeconds?.[definition.key];
    const durationFrames =
      durationSeconds !== undefined ? secondsToFrames(durationSeconds) : template.durationFrames;

    for (const item of items) {
      if (item.photoAssetId) {
        assetIds.add(item.photoAssetId);
      }
    }
    if (template.backgroundAssetId) {
      assetIds.add(template.backgroundAssetId);
    }

    templateManifests[template.id] = template;
    slides.push({
      id: `slide-${definition.key}`,
      templateId: template.id,
      title: template.name,
      menuSectionIds: section ? [section.id] : [],
      menuItemIds: items.map((item) => item.id),
      backgroundAssetId: null,
      durationFrames,
      sortOrder: slides.length + 1
    });
  }

  return {
    id: options.deckId ?? "deck-daily-preview",
    orgId: options.orgId ?? "00000000-0000-4000-8000-000000000000",
    locationId: options.locationId ?? "00000000-0000-4000-8000-000000000000",
    canteenId: options.canteenId ?? "00000000-0000-4000-8000-000000000000",
    menuVersionId: options.menuVersionId ?? "menu-version-preview",
    status: options.status ?? "draft",
    fps: 30,
    canvas: { width: 1920, height: 1080, aspectRatio: "16:9" },
    slides,
    templateVersionIds: Object.keys(templateManifests).map(
      (templateId) => options.templateVersionIds?.[templateId] ?? `${templateId}@current`
    ),
    templateManifests,
    assetIds: Array.from(assetIds),
    assetUrls: {},
    rendererVersion: options.rendererVersion ?? "0.2.0"
  };
}

export function deckDurationSeconds(deck: DeckManifest) {
  const frames = deck.slides.reduce((total, slide) => total + slide.durationFrames, 0);
  return frames / deck.fps;
}
