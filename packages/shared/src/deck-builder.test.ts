import { describe, expect, it } from "vitest";
import {
  buildDailyDeckManifest,
  deckDurationSeconds,
  framesToSeconds,
  resolveSectionByKey,
  secondsToFrames
} from "./deck-builder";
import { normalizeManifest } from "./template-manifest";
import { dailyLoopTemplates, defaultTemplateManifests } from "./templates";
import { deckManifestSchema, templateManifestV2Schema, type MenuExtractionResult } from "./schemas";

function menuItem(id: string, name: string, photoAssetId: string | null = null) {
  return {
    id,
    name,
    description: null,
    prices: [{ label: "porce", amount: 129, currency: "CZK" as const }],
    allergens: ["1" as const],
    allergensUnknown: false,
    dietaryTags: [],
    modifiers: [],
    available: true,
    highlight: false,
    photoAssetId,
    sourceRefs: [],
    confidence: 1
  };
}

function fullMenu(): MenuExtractionResult {
  return {
    restaurant: { name: "MASI-CO food", locale: "cs-CZ", currency: "CZK" },
    date: "2026-07-08",
    locationName: null,
    warnings: [],
    sections: [
      {
        id: "soups",
        name: "Polévky",
        items: [
          menuItem("s1", "Hovězí vývar", "11111111-1111-4111-8111-111111111111"),
          menuItem("s2", "Gulášová")
        ]
      },
      {
        id: "mains",
        name: "Hlavní jídla",
        items: [
          menuItem("m1", "Svíčková"),
          menuItem("m2", "Řízek"),
          menuItem("m3", "Guláš"),
          menuItem("m4", "Rizoto"),
          menuItem("m5", "Salát"),
          menuItem("m6", "Šesté jídlo navíc")
        ]
      },
      { id: "pizza", name: "Pizza dne", items: [menuItem("p1", "Pizza Prosciutto")] },
      { id: "buffet", name: "Teplý bufet", items: [menuItem("b1", "Kuřecí stehno")] },
      { id: "desserts", name: "Dezerty", items: [menuItem("d1", "Štrúdl")] }
    ]
  };
}

describe("buildDailyDeckManifest", () => {
  it("builds the full 6-slide loop from a complete menu", () => {
    const deck = buildDailyDeckManifest(fullMenu());

    expect(deck.slides.map((slide) => slide.id)).toEqual([
      "slide-intro",
      "slide-soups",
      "slide-mains",
      "slide-pizza",
      "slide-buffet",
      "slide-special"
    ]);
    expect(deckManifestSchema.parse(deck)).toBeTruthy();
  });

  it("skips optional sections without items and keeps intro", () => {
    const menu = fullMenu();
    menu.sections = menu.sections.filter((section) => ["soups", "mains"].includes(section.id));

    const deck = buildDailyDeckManifest(menu);
    expect(deck.slides.map((slide) => slide.id)).toEqual([
      "slide-intro",
      "slide-soups",
      "slide-mains"
    ]);
  });

  it("limits items to template maxItems (5 mains, 2 soups)", () => {
    const deck = buildDailyDeckManifest(fullMenu());
    const mains = deck.slides.find((slide) => slide.id === "slide-mains");
    const soups = deck.slides.find((slide) => slide.id === "slide-soups");

    expect(mains?.menuItemIds).toHaveLength(5);
    expect(mains?.menuItemIds).not.toContain("m6");
    expect(soups?.menuItemIds).toEqual(["s1", "s2"]);
  });

  it("applies per-slide duration overrides in seconds and clamps them", () => {
    const deck = buildDailyDeckManifest(fullMenu(), {
      slideDurationsSeconds: { intro: 10, mains: 999, soups: 1 }
    });

    const bySlide = Object.fromEntries(deck.slides.map((slide) => [slide.id, slide.durationFrames]));
    expect(bySlide["slide-intro"]).toBe(10 * 30);
    expect(bySlide["slide-mains"]).toBe(60 * 30);
    expect(bySlide["slide-soups"]).toBe(3 * 30);
    expect(bySlide["slide-pizza"]).toBe(210);
  });

  it("collects dish photo asset ids into deck.assetIds", () => {
    const deck = buildDailyDeckManifest(fullMenu());
    expect(deck.assetIds).toContain("11111111-1111-4111-8111-111111111111");
  });

  it("embeds template manifests for the player", () => {
    const deck = buildDailyDeckManifest(fullMenu());
    expect(Object.keys(deck.templateManifests ?? {})).toContain("mains-grid");
  });

  it("resolves legacy section ids and czech names to section keys", () => {
    const menu = fullMenu();
    menu.sections[4] = { ...menu.sections[4], id: "custom-x", name: "Moučníky a speciality" };

    expect(resolveSectionByKey(menu, "special")?.id).toBe("custom-x");
    expect(resolveSectionByKey(menu, "pizza")?.id).toBe("pizza");
  });

  it("skips unavailable items", () => {
    const menu = fullMenu();
    menu.sections[0].items[0] = { ...menu.sections[0].items[0], available: false };

    const deck = buildDailyDeckManifest(menu);
    const soups = deck.slides.find((slide) => slide.id === "slide-soups");
    expect(soups?.menuItemIds).toEqual(["s2"]);
  });
});

describe("duration helpers", () => {
  it("converts and clamps seconds to frames", () => {
    expect(secondsToFrames(4)).toBe(120);
    expect(secondsToFrames(1)).toBe(90);
    expect(secondsToFrames(120)).toBe(1800);
    expect(framesToSeconds(120)).toBe(4);
  });

  it("sums the loop duration", () => {
    const deck = buildDailyDeckManifest(fullMenu());
    expect(deckDurationSeconds(deck)).toBe(
      deck.slides.reduce((total, slide) => total + slide.durationFrames, 0) / 30
    );
  });
});

describe("daily loop templates", () => {
  it("all validate against templateManifestV2Schema", () => {
    for (const template of dailyLoopTemplates) {
      expect(() => templateManifestV2Schema.parse(template)).not.toThrow();
    }
  });

  it("keep every layer inside the canvas", () => {
    for (const template of dailyLoopTemplates) {
      for (const layer of template.layers) {
        expect(layer.frame.x, `${template.id}/${layer.id} x`).toBeGreaterThanOrEqual(0);
        expect(layer.frame.y, `${template.id}/${layer.id} y`).toBeGreaterThanOrEqual(0);
        expect(layer.frame.x + layer.frame.w, `${template.id}/${layer.id} right`).toBeLessThanOrEqual(1920);
        expect(layer.frame.y + layer.frame.h, `${template.id}/${layer.id} bottom`).toBeLessThanOrEqual(1080);
      }
    }
  });

  it("intro slide keeps the 4-second brand timing", () => {
    const intro = dailyLoopTemplates.find((template) => template.id === "masico-intro");
    expect(intro?.durationFrames).toBe(120);
  });
});

describe("normalizeManifest", () => {
  it("passes v2 manifests through unchanged", () => {
    const template = dailyLoopTemplates[0];
    expect(normalizeManifest(template)).toBe(template);
  });

  it("converts v1 manifests to v2 with positioned layers", () => {
    const legacy = defaultTemplateManifests[0];
    const normalized = normalizeManifest(legacy);

    expect(normalized.schemaVersion).toBe(2);
    expect(normalized.durationFrames).toBe(legacy.durationFrames);
    expect(normalized.layers.length).toBeGreaterThan(0);
    expect(() => templateManifestV2Schema.parse(normalized)).not.toThrow();
  });
});
