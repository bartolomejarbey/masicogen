import { describe, expect, it } from "vitest";
import { dailyLoopSlides } from "./deck-builder";
import { templateManifestV2Schema, type TemplateManifestV2 } from "./schemas";
import { defaultFooterLegendText } from "./settings";
import { dailyLoopTemplates, holidayNoticeTemplate } from "./templates";

const allTemplates: TemplateManifestV2[] = [...dailyLoopTemplates, holidayNoticeTemplate];

describe("vestavěné TV šablony (v2)", () => {
  for (const template of allTemplates) {
    it(`šablona ${template.id} projde templateManifestV2Schema beze změny`, () => {
      const parsed = templateManifestV2Schema.parse(template);

      // Parse nesmí nic doplňovat ani měnit — šablony musí být definované
      // kompletně, jinak by se editor, TV a MP4 render mohly lišit v defaultech.
      expect(parsed).toEqual(template);
      expect(parsed.schemaVersion).toBe(2);
    });

    it(`šablona ${template.id} má unikátní id vrstev`, () => {
      const layerIds = template.layers.map((layer) => layer.id);
      const duplicates = layerIds.filter((id, index) => layerIds.indexOf(id) !== index);

      expect(duplicates).toEqual([]);
      expect(new Set(layerIds).size).toBe(layerIds.length);
    });
  }

  it("id šablon jsou unikátní napříč katalogem", () => {
    const templateIds = allTemplates.map((template) => template.id);
    expect(new Set(templateIds).size).toBe(templateIds.length);
  });

  it("každý slide denní smyčky má svou šablonu v dailyLoopTemplates", () => {
    const available = new Set(dailyLoopTemplates.map((template) => template.id));
    for (const definition of dailyLoopSlides) {
      expect(available.has(definition.templateId)).toBe(true);
    }
  });

  it("sváteční šablona stojí mimo denní smyčku", () => {
    expect(dailyLoopTemplates.some((template) => template.id === holidayNoticeTemplate.id)).toBe(
      false
    );
  });

  it("výchozí text footeru odpovídá defaultFooterLegendText ze settings", () => {
    // Obě konstanty (hardcoded text v brandFooter a default v orgSettingsSchema)
    // musí zůstat shodné — jinak by deck bez settings ukázal jinou legendu
    // než deck postavený přes resolveSettings({}).
    for (const template of dailyLoopTemplates) {
      const footer = template.layers.find(
        (layer) => layer.type === "text" && layer.id === "brand-footer-text"
      );

      expect(footer, `šablona ${template.id} nemá vrstvu brand-footer-text`).toBeDefined();
      if (footer?.type === "text") {
        expect(footer.text).toBe(defaultFooterLegendText);
      }
    }
  });
});
