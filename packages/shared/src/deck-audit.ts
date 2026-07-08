import {
  dailyLoopSlides,
  deckDurationSeconds,
  resolveSectionByKey,
  SLIDE_MAX_DURATION_SECONDS,
  SLIDE_MIN_DURATION_SECONDS
} from "./deck-builder";
import { formatCzechDate, formatCzk } from "./format";
import { isTemplateManifestV2 } from "./template-manifest";
import type {
  DeckManifest,
  ImageLayerV2,
  LayerFrame,
  MenuExtractionItem,
  MenuExtractionResult,
  SectionKey,
  ShapeLayerV2,
  Slide,
  TemplateLayerV2,
  TemplateManifestV2,
  TextLayerV2
} from "./schemas";

export type AuditSeverity = "error" | "warning" | "info";

export type AuditIssue = {
  severity: AuditSeverity;
  code: string;
  /** Lidsky srozumitelná česká hláška — technické detaily patří do meta. */
  message: string;
  slideId?: string;
  layerId?: string;
  itemId?: string;
  meta?: Record<string, unknown>;
};

export type AuditOptions = {
  /** Dnešní datum ve formátu YYYY-MM-DD — zapíná kontrolu date_mismatch. */
  today?: string;
};

/**
 * Jediné kódy, které smí zablokovat provozní flow (rozhodnutí 8 blueprintu):
 * chyby v datech menu a špatný den. Vizuální nálezy provoz nikdy nezastaví.
 */
export const BLOCKING_AUDIT_CODES = [
  "missing_price",
  "missing_allergens",
  "date_mismatch"
] as const;

export type BlockingAuditCode = (typeof BLOCKING_AUDIT_CODES)[number];

// --- Prahy pravidel ---

const LOOP_MIN_SECONDS = 20;
const LOOP_WARN_MAX_SECONDS = 120;
const LOOP_ERROR_MAX_SECONDS = 300;

/** Odhad šířky znaku jako násobek fontSizePx (serif Lora, tučný/normální řez). */
const CHAR_WIDTH_BOLD = 0.56;
const CHAR_WIDTH_REGULAR = 0.52;
const UPPERCASE_FACTOR = 1.12;
const OVERFLOW_WARNING_RATIO = 1;
const OVERFLOW_INFO_RATIO = 0.85;

/** Pod tímto kontrastem by editor hlásil error; v provozním auditu je to warning. */
const CONTRAST_CRITICAL_RATIO = 3;

const LOW_CONFIDENCE_THRESHOLD = 0.72;

const SECTION_KEYS: SectionKey[] = ["soups", "mains", "pizza", "buffet", "special"];

const SECTION_LABELS: Record<SectionKey, string> = {
  soups: "Polévky",
  mains: "Hlavní jídla",
  pizza: "Pizza",
  buffet: "Teplý bufet",
  special: "Dnes navíc"
};

const REQUIRED_SLIDE_MESSAGES: Record<string, string> = {
  intro: "Chybí úvodní slide s přehledem dne — přidejte ho zpět do smyčky.",
  soups: "Chybí slide Polévky — doplňte alespoň jednu polévku.",
  mains: "Chybí slide Hlavní jídla — doplňte alespoň jedno hlavní jídlo."
};

/**
 * Deterministický pre-publish audit decku. Čistá funkce — nikam nesahá,
 * jen vrátí seznam nálezů. Blokující jsou pouze kódy z BLOCKING_AUDIT_CODES.
 */
export function auditDeck(
  deck: DeckManifest,
  menu: MenuExtractionResult,
  options: AuditOptions = {}
): AuditIssue[] {
  const issues: AuditIssue[] = [];

  auditMenuData(issues, menu);
  auditMenuDate(issues, menu, options.today);
  auditRequiredSlides(issues, deck);
  auditLoopDuration(issues, deck);

  const presentSections = new Set<SectionKey>(
    SECTION_KEYS.filter((key) => resolveSectionByKey(menu, key) !== null)
  );
  const auditedTemplateIds = new Set<string>();

  for (const slide of deck.slides) {
    const manifest = deck.templateManifests?.[slide.templateId];
    if (!manifest || !isTemplateManifestV2(manifest)) {
      issues.push({
        severity: "info",
        code: "legacy_template",
        message: `Slide „${slide.title}“ používá starší šablonu — vizuální kontroly jsme u něj přeskočili.`,
        slideId: slide.id,
        meta: { templateId: slide.templateId }
      });
      continue;
    }

    auditSlide(issues, menu, slide, manifest, presentSections, auditedTemplateIds);
  }

  return issues;
}

// --- Pravidlo 7: data menu (merge validateMenuForApproval, s itemId) ---

function auditMenuData(issues: AuditIssue[], menu: MenuExtractionResult) {
  if (!menu.date) {
    issues.push({
      severity: "error",
      code: "missing_date",
      message: "Menu nemá vyplněné datum — doplňte, pro který den platí."
    });
  }

  for (const section of menu.sections) {
    for (const item of section.items) {
      if (item.confidence < LOW_CONFIDENCE_THRESHOLD) {
        issues.push({
          severity: "warning",
          code: "low_confidence",
          message: `Položku „${item.name}“ jsme z lístku přečetli s nižší jistotou — zkontrolujte prosím název a cenu.`,
          itemId: item.id
        });
      }

      if (item.prices.length === 0 || item.prices.some((price) => price.amount === null)) {
        issues.push({
          severity: "error",
          code: "missing_price",
          message: `U položky „${item.name}“ chybí cena — bez ní nejde menu schválit.`,
          itemId: item.id
        });
      }

      if (item.allergensUnknown || item.allergens.length === 0) {
        issues.push({
          severity: "error",
          code: "missing_allergens",
          message: `U položky „${item.name}“ nejsou potvrzené alergeny — bez nich nejde menu schválit.`,
          itemId: item.id
        });
      }
    }
  }
}

// --- Pravidlo 8: date_mismatch ---

function auditMenuDate(issues: AuditIssue[], menu: MenuExtractionResult, today?: string) {
  if (!today || !menu.date || menu.date === today) {
    return;
  }

  issues.push({
    severity: "error",
    code: "date_mismatch",
    message: `Menu platí pro ${formatCzechDate(menu.date)}, ale dnes je ${formatCzechDate(today)} — zkontrolujte, že pouštíte správný den.`,
    meta: { menuDate: menu.date, today }
  });
}

// --- Pravidlo 5: povinné slidy denní smyčky ---

function auditRequiredSlides(issues: AuditIssue[], deck: DeckManifest) {
  for (const definition of dailyLoopSlides) {
    if (definition.optional) {
      continue;
    }

    const present = deck.slides.some(
      (slide) => slide.templateId === definition.templateId || slide.id === `slide-${definition.key}`
    );
    if (present) {
      continue;
    }

    issues.push({
      severity: "error",
      code: "missing_required_slide",
      message:
        REQUIRED_SLIDE_MESSAGES[definition.key] ??
        `Ve smyčce chybí povinný slide „${definition.key}“.`,
      meta: { slideKey: definition.key, templateId: definition.templateId }
    });
  }
}

// --- Pravidlo 4: délka smyčky a slidů ---

function auditLoopDuration(issues: AuditIssue[], deck: DeckManifest) {
  const totalSeconds = deckDurationSeconds(deck);

  if (totalSeconds > LOOP_ERROR_MAX_SECONDS) {
    issues.push({
      severity: "error",
      code: "loop_duration",
      message: `Smyčka trvá ${formatSeconds(totalSeconds)}, tedy přes 5 minut — to je na obrazovku příliš. Zkraťte slidy.`,
      meta: { seconds: totalSeconds }
    });
  } else if (totalSeconds > LOOP_WARN_MAX_SECONDS) {
    issues.push({
      severity: "warning",
      code: "loop_duration",
      message: `Smyčka trvá ${formatSeconds(totalSeconds)}, tedy přes 2 minuty — hosté ji celou neuvidí. Zvažte zkrácení.`,
      meta: { seconds: totalSeconds }
    });
  }

  if (totalSeconds < LOOP_MIN_SECONDS) {
    issues.push({
      severity: "warning",
      code: "loop_duration",
      message: `Celá smyčka trvá jen ${formatSeconds(totalSeconds)} — obsah se bude střídat příliš rychle. Prodlužte slidy.`,
      meta: { seconds: totalSeconds }
    });
  }

  for (const slide of deck.slides) {
    const seconds = slide.durationFrames / deck.fps;
    if (seconds < SLIDE_MIN_DURATION_SECONDS || seconds > SLIDE_MAX_DURATION_SECONDS) {
      issues.push({
        severity: "warning",
        code: "loop_duration",
        message: `Slide „${slide.title}“ trvá ${formatSeconds(seconds)} — doporučujeme 3 až 60 sekund.`,
        slideId: slide.id,
        meta: { seconds }
      });
    }
  }
}

// --- Vizuální kontroly jednoho slidu (pravidla 1, 2, 3, 6, 9, 10) ---

function auditSlide(
  issues: AuditIssue[],
  menu: MenuExtractionResult,
  slide: Slide,
  manifest: TemplateManifestV2,
  presentSections: Set<SectionKey>,
  auditedTemplateIds: Set<string>
) {
  const slotItems = collectSlotItems(menu, slide);
  const hiddenGroups = collectHiddenGroups(manifest.layers, slotItems);

  auditItemsRange(issues, slide, manifest);
  auditDeadBindings(issues, slide, manifest, presentSections);

  // Kontroly nezávislé na datech menu stačí spustit jednou pro každou šablonu.
  if (!auditedTemplateIds.has(manifest.id)) {
    auditedTemplateIds.add(manifest.id);
    auditSmallFonts(issues, slide, manifest);
  }

  for (const layer of manifest.layers) {
    if (layer.group && hiddenGroups.has(layer.group)) {
      continue;
    }

    if (layer.type === "image") {
      auditMissingPhoto(issues, slide, layer, manifest, slotItems);
      continue;
    }

    if (layer.type !== "text") {
      continue;
    }

    const { bound, item } = boundItem(layer, slotItems);
    if (bound && !item) {
      continue;
    }

    const content = resolveTextContent(layer, item, menu, slide);
    if (!content || !content.trim()) {
      continue;
    }

    auditTextOverflow(issues, slide, layer, item, content);
    auditContrast(issues, slide, layer, content, manifest, slotItems, hiddenGroups);
  }
}

// --- Pravidlo 6: počet položek vs. rozsah šablony ---

function auditItemsRange(issues: AuditIssue[], slide: Slide, manifest: TemplateManifestV2) {
  const count = slide.menuItemIds.length;
  const { minItems, maxItems } = manifest.validationRules;

  if (count > 0 && count < minItems) {
    issues.push({
      severity: "warning",
      code: "items_out_of_range",
      message: `Slide „${slide.title}“ má jen ${formatItemCount(count)} — šablona počítá s ${minItems} až ${maxItems}.`,
      slideId: slide.id,
      meta: { count, minItems, maxItems }
    });
  } else if (count > maxItems) {
    issues.push({
      severity: "warning",
      code: "items_out_of_range",
      message: `Slide „${slide.title}“ má ${formatItemCount(count)} — šablona jich pobere nejvýš ${maxItems}. Rozdělte je.`,
      slideId: slide.id,
      meta: { count, minItems, maxItems }
    });
  }
}

// --- Pravidlo 9: dead_binding — sekce, která v menu vůbec není ---

function auditDeadBindings(
  issues: AuditIssue[],
  slide: Slide,
  manifest: TemplateManifestV2,
  presentSections: Set<SectionKey>
) {
  const definition = dailyLoopSlides.find((entry) => entry.templateId === slide.templateId);
  if (!definition || definition.optional) {
    return;
  }

  const reported = new Set<SectionKey>();
  for (const layer of manifest.layers) {
    if (!("binding" in layer) || !layer.binding || layer.binding.source !== "item") {
      continue;
    }

    const sectionKey = layer.binding.sectionKey;
    if (presentSections.has(sectionKey) || reported.has(sectionKey)) {
      continue;
    }

    reported.add(sectionKey);
    issues.push({
      severity: "info",
      code: "dead_binding",
      message: `Slide „${slide.title}“ počítá se sekcí ${SECTION_LABELS[sectionKey]}, která v menu chybí — tato část zůstane prázdná.`,
      slideId: slide.id,
      layerId: layer.id,
      meta: { sectionKey }
    });
  }
}

// --- Pravidlo 10: small_font ---

function auditSmallFonts(issues: AuditIssue[], slide: Slide, manifest: TemplateManifestV2) {
  const minFontSizePx = manifest.validationRules.minFontSizePx;

  for (const layer of manifest.layers) {
    if (layer.type !== "text" || layer.fontSizePx >= minFontSizePx) {
      continue;
    }

    issues.push({
      severity: "warning",
      code: "small_font",
      message: `Písmo o velikosti ${layer.fontSizePx} px je na TV z dálky špatně čitelné — šablona doporučuje alespoň ${minFontSizePx} px.`,
      slideId: slide.id,
      layerId: layer.id,
      meta: { fontSizePx: layer.fontSizePx, minFontSizePx }
    });
  }
}

// --- Pravidlo 2: missing_photo ---

function auditMissingPhoto(
  issues: AuditIssue[],
  slide: Slide,
  layer: ImageLayerV2,
  manifest: TemplateManifestV2,
  slotItems: SlotItems
) {
  if (manifest.validationRules.requirePhotos !== "warn") {
    return;
  }

  const { bound, item } = boundItem(layer, slotItems);
  if (!bound || !item || item.photoAssetId) {
    return;
  }

  issues.push({
    severity: "warning",
    code: "missing_photo",
    message: `Jídlo „${item.name}“ nemá fotku — na obrazovce se místo ní ukáže jen zástupný obrázek.`,
    slideId: slide.id,
    layerId: layer.id,
    itemId: item.id,
    meta: { dishName: item.name }
  });
}

// --- Pravidlo 1: text_overflow ---

function auditTextOverflow(
  issues: AuditIssue[],
  slide: Slide,
  layer: TextLayerV2,
  item: MenuExtractionItem | null,
  content: string
) {
  const charWidth =
    (layer.fontWeight >= 700 ? CHAR_WIDTH_BOLD : CHAR_WIDTH_REGULAR) *
    (layer.uppercase ? UPPERCASE_FACTOR : 1);
  const estimatedWidth = content.length * layer.fontSizePx * charWidth;

  let ratio: number | null = null;
  if (layer.maxLines === 1) {
    ratio = estimatedWidth / layer.frame.w;
  } else {
    const neededLines = Math.ceil(estimatedWidth / layer.frame.w);
    if (neededLines > layer.maxLines) {
      ratio = (neededLines * layer.fontSizePx * layer.lineHeight) / layer.frame.h;
    }
  }

  if (ratio === null || ratio < OVERFLOW_INFO_RATIO) {
    return;
  }

  const base = {
    slideId: slide.id,
    layerId: layer.id,
    itemId: item?.id,
    meta: { ratio: Math.round(ratio * 100) / 100, resolvedText: content }
  };

  if (ratio > OVERFLOW_WARNING_RATIO) {
    issues.push({
      severity: "warning",
      code: "text_overflow",
      message: `Text „${shorten(content)}“ se na slide nevejde — zkraťte název.`,
      ...base
    });
  } else {
    issues.push({
      severity: "info",
      code: "text_overflow",
      message: `Text „${shorten(content)}“ je téměř na hranici vyhrazeného místa — zvažte kratší znění.`,
      ...base
    });
  }
}

// --- Pravidlo 3: low_contrast / text_on_photo ---

function auditContrast(
  issues: AuditIssue[],
  slide: Slide,
  layer: TextLayerV2,
  content: string,
  manifest: TemplateManifestV2,
  slotItems: SlotItems,
  hiddenGroups: Set<string>
) {
  const backdrop = resolveBackdrop(layer, manifest, slotItems, hiddenGroups);
  if (!backdrop) {
    return;
  }

  if (backdrop.kind === "photo") {
    if (backdrop.overlay === "none") {
      issues.push({
        severity: "info",
        code: "text_on_photo",
        message: `Text „${shorten(content)}“ leží přímo na fotce bez ztmavení — může se špatně číst.`,
        slideId: slide.id,
        layerId: layer.id,
        meta: { photoLayerId: backdrop.layerId }
      });
    }
    return;
  }

  const textColor = parseColor(layer.color);
  if (!textColor) {
    return;
  }

  const contrast = contrastRatio(textColor, backdrop.color);
  const minContrast = manifest.validationRules.minContrastRatio;
  if (contrast >= minContrast) {
    return;
  }

  // Rozhodnutí 8: vizuální nálezy v provozu nikdy neblokují — maximálně warning.
  const critical = contrast < CONTRAST_CRITICAL_RATIO;
  issues.push({
    severity: "warning",
    code: "low_contrast",
    message: critical
      ? `Text „${shorten(content)}“ na svém pozadí téměř splývá — zvolte výrazně kontrastnější barvu.`
      : `Text „${shorten(content)}“ je na svém pozadí hůře čitelný — zvažte kontrastnější barvu.`,
    slideId: slide.id,
    layerId: layer.id,
    meta: {
      contrast: Math.round(contrast * 100) / 100,
      textColor: layer.color,
      backgroundColor: backdrop.label
    }
  });
}

// --- Rozklad slidu po vzoru TvComposition ---

type SlotItems = Partial<Record<SectionKey, MenuExtractionItem[]>>;

function collectSlotItems(menu: MenuExtractionResult, slide: Slide): SlotItems {
  const result: SlotItems = {};

  for (const key of SECTION_KEYS) {
    const section = resolveSectionByKey(menu, key);
    if (!section) {
      continue;
    }

    result[key] = slide.menuItemIds.length
      ? section.items.filter((item) => slide.menuItemIds.includes(item.id))
      : section.items.filter((item) => item.available);
  }

  return result;
}

function boundItem(
  layer: TemplateLayerV2,
  slotItems: SlotItems
): { bound: boolean; item: MenuExtractionItem | null } {
  if (!("binding" in layer) || !layer.binding || layer.binding.source !== "item") {
    return { bound: false, item: null };
  }

  const items = slotItems[layer.binding.sectionKey] ?? [];
  return { bound: true, item: items[layer.binding.index] ?? null };
}

/**
 * Skupiny, jejichž slot nemá položku, TvComposition vůbec nevykreslí —
 * jejich vrstvy proto z vizuálních kontrol vynecháváme.
 */
function collectHiddenGroups(layers: TemplateLayerV2[], slotItems: SlotItems): Set<string> {
  const groupBindings = new Map<string, { sectionKey: SectionKey; index: number }>();

  for (const layer of layers) {
    if (!layer.group || groupBindings.has(layer.group)) {
      continue;
    }

    if ("binding" in layer && layer.binding && layer.binding.source === "item") {
      groupBindings.set(layer.group, {
        sectionKey: layer.binding.sectionKey,
        index: layer.binding.index
      });
    }
  }

  const hidden = new Set<string>();
  for (const [group, binding] of groupBindings) {
    const items = slotItems[binding.sectionKey] ?? [];
    if (binding.index >= items.length) {
      hidden.add(group);
    }
  }

  return hidden;
}

/** Stejná logika jako resolveTextContent v TvComposition (bez typografických úprav). */
function resolveTextContent(
  layer: TextLayerV2,
  item: MenuExtractionItem | null,
  menu: MenuExtractionResult,
  slide: Slide
): string | null {
  const binding = layer.binding;

  if (!binding || binding.source === "static") {
    return layer.text;
  }

  if (binding.source === "menu") {
    return binding.field === "date" ? formatCzechDate(menu.date) : slide.title;
  }

  if (!item) {
    return null;
  }

  switch (binding.field) {
    case "name":
      return item.name;
    case "description":
      return item.description;
    case "price":
      return formatCzk(item.prices[0]?.amount ?? null);
    case "allergens":
      return item.allergens.length > 0 ? item.allergens.join(",") : null;
    default:
      return null;
  }
}

// --- Podklad pod textem ---

type Backdrop =
  | { kind: "color"; color: Rgb; label: string }
  | { kind: "photo"; overlay: ImageLayerV2["overlay"]; layerId: string };

function resolveBackdrop(
  textLayer: TextLayerV2,
  manifest: TemplateManifestV2,
  slotItems: SlotItems,
  hiddenGroups: Set<string>
): Backdrop | null {
  let top: ShapeLayerV2 | ImageLayerV2 | null = null;

  for (const layer of manifest.layers) {
    if (layer.type !== "shape" && layer.type !== "image") {
      continue;
    }
    if (layer.frame.zIndex >= textLayer.frame.zIndex) {
      continue;
    }
    if (!framesIntersect(layer.frame, textLayer.frame)) {
      continue;
    }
    if (layer.group && hiddenGroups.has(layer.group)) {
      continue;
    }
    if (layer.type === "image") {
      const { bound, item } = boundItem(layer, slotItems);
      if (bound && !item) {
        continue;
      }
    }
    // Pozdější vrstva se stejným zIndexem se kreslí navrch — proto >=.
    if (!top || layer.frame.zIndex >= top.frame.zIndex) {
      top = layer;
    }
  }

  if (!top) {
    if (manifest.backgroundGradient) {
      return null;
    }
    const base = parseColor(manifest.backgroundColor);
    return base ? { kind: "color", color: base, label: manifest.backgroundColor } : null;
  }

  if (top.type === "image") {
    return { kind: "photo", overlay: top.overlay, layerId: top.id };
  }

  const fill = parseColor(top.fill);
  if (!fill) {
    return null;
  }
  if (top.opacity >= 1) {
    return { kind: "color", color: fill, label: top.fill };
  }
  if (manifest.backgroundGradient) {
    return null;
  }

  const base = parseColor(manifest.backgroundColor);
  if (!base) {
    return null;
  }

  const blended = blendOver(fill, top.opacity, base);
  return { kind: "color", color: blended, label: rgbToHex(blended) };
}

function framesIntersect(a: LayerFrame, b: LayerFrame) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// --- Barvy a WCAG kontrast ---

type Rgb = { r: number; g: number; b: number };

function parseColor(value: string): Rgb | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) {
    return null;
  }

  const hex =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((char) => char + char)
          .join("")
      : match[1];

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

function blendOver(foreground: Rgb, opacity: number, background: Rgb): Rgb {
  const mix = (fg: number, bg: number) => Math.round(fg * opacity + bg * (1 - opacity));
  return {
    r: mix(foreground.r, background.r),
    g: mix(foreground.g, background.g),
    b: mix(foreground.b, background.b)
  };
}

function rgbToHex(color: Rgb) {
  const channel = (value: number) => value.toString(16).padStart(2, "0");
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

function relativeLuminance(color: Rgb) {
  const linear = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}

function contrastRatio(a: Rgb, b: Rgb) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [darker, lighter] = la < lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

// --- Formátování hlášek ---

function shorten(value: string, max = 42) {
  return value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;
}

function formatSeconds(seconds: number) {
  const rounded = Math.round(seconds * 10) / 10;
  if (!Number.isInteger(rounded)) {
    return `${String(rounded).replace(".", ",")} sekundy`;
  }
  if (rounded === 1) {
    return "1 sekundu";
  }
  if (rounded >= 2 && rounded <= 4) {
    return `${rounded} sekundy`;
  }
  return `${rounded} sekund`;
}

function formatItemCount(count: number) {
  if (count === 1) {
    return "1 položku";
  }
  if (count >= 2 && count <= 4) {
    return `${count} položky`;
  }
  return `${count} položek`;
}
