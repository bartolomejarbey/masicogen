import type {
  DeckManifest,
  MenuExtractionResult,
  TemplateManifest
} from "./schemas";

export type ValidationIssue = {
  severity: "warning" | "error";
  code: string;
  message: string;
};

export function validateMenuForApproval(menu: MenuExtractionResult): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!menu.date) {
    issues.push({
      severity: "error",
      code: "missing_date",
      message: "Chybí datum menu."
    });
  }

  for (const section of menu.sections) {
    for (const item of section.items) {
      if (item.confidence < 0.72) {
        issues.push({
          severity: "warning",
          code: "low_confidence",
          message: `${item.name}: nízká jistota extrakce.`
        });
      }

      if (item.prices.some((price) => price.amount === null)) {
        issues.push({
          severity: "error",
          code: "missing_price",
          message: `${item.name}: chybí cena.`
        });
      }

      if (item.allergensUnknown || item.allergens.length === 0) {
        issues.push({
          severity: "error",
          code: "missing_allergens",
          message: `${item.name}: alergeny nejsou ověřené.`
        });
      }
    }
  }

  return issues;
}

export function validateDeckAgainstTemplates(
  deck: DeckManifest,
  templates: TemplateManifest[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const templateIds = new Set(templates.map((template) => template.id));

  for (const slide of deck.slides) {
    const template = templates.find((candidate) => candidate.id === slide.templateId);

    if (!templateIds.has(slide.templateId)) {
      issues.push({
        severity: "error",
        code: "missing_template",
        message: `${slide.title}: chybí šablona ${slide.templateId}.`
      });
    }

    if (template && slide.menuItemIds.length > template.validationRules.maxItemsPerSlide) {
      issues.push({
        severity: "error",
        code: "too_many_items",
        message: `${slide.title}: obsahuje ${slide.menuItemIds.length} položek, limit šablony je ${template.validationRules.maxItemsPerSlide}. Rozdělte slide.`
      });
    }

    if (slide.durationFrames < 90) {
      issues.push({
        severity: "warning",
        code: "short_duration",
        message: `${slide.title}: slide je kratší než 3 sekundy.`
      });
    }
  }

  const legendRequired = deck.slides.some((slide) => {
    const template = templates.find((candidate) => candidate.id === slide.templateId);
    return template?.validationRules.requireAllergenLegend ?? false;
  });
  const hasLegend = deck.slides.some((slide) => slide.templateId === "allergen-legend");
  if (legendRequired && !hasLegend) {
    issues.push({
      severity: "error",
      code: "missing_allergen_legend",
      message: "Deck neobsahuje alergenovou legendu."
    });
  }

  return issues;
}
