import { describe, expect, it } from "vitest";
import {
  buildManualPresentationRenderModel,
  createManualPresentationManifest,
  createManualPresentationSlideItems,
  manualPresentationDocumentSchema,
  manualPresentationSourceText,
  padManualSlideItems,
  type ManualPresentationDocument,
  type ManualPresentationItem
} from "./manual-presentation";

const locationId = "11111111-1111-4111-8111-111111111111";
const canteenId = "22222222-2222-4222-8222-222222222222";
const photoAssetId = "33333333-3333-4333-8333-333333333333";
const firstSlideId = "55555555-5555-4555-8555-555555555555";
const secondSlideId = "66666666-6666-4666-8666-666666666666";
const firstItemId = "77777777-7777-4777-8777-777777777777";
const secondItemId = "88888888-8888-4888-8888-888888888888";

function item(overrides: Partial<ManualPresentationItem> & { id: string }): ManualPresentationItem {
  return {
    name: "",
    description: "",
    priceCzk: null,
    allergens: [],
    photoAssetId: null,
    photoFocalPoint: { x: 0.5, y: 0.5 },
    photoSource: null,
    ...overrides
  };
}

function documentFixture(): ManualPresentationDocument {
  return {
    schemaVersion: 1,
    id: "44444444-4444-4444-8444-444444444444",
    name: "Páteční prezentace",
    presentationDate: "2026-07-10",
    locationId,
    canteenId,
    slides: [
      {
        id: firstSlideId,
        title: "Dnešní nabídka",
        baseTemplateId: "mains-grid",
        durationSeconds: 10,
        manifest: createManualPresentationManifest("mains-grid", firstSlideId),
        items: [
          item({
            id: firstItemId,
            name: "Kuřecí řízek",
            description: "bramborová kaše",
            priceCzk: 159,
            allergens: ["1", "3", "7"],
            photoAssetId,
            photoFocalPoint: { x: 0.4, y: 0.6 },
            photoSource: "upload"
          })
        ]
      },
      {
        id: secondSlideId,
        title: "Dnes navíc",
        baseTemplateId: "special-day",
        durationSeconds: 8,
        manifest: createManualPresentationManifest("special-day", secondSlideId),
        items: [
          item({
            id: secondItemId,
            name: "Jablečný štrúdl",
            priceCzk: 49,
            allergens: ["1", "3"]
          })
        ]
      }
    ]
  };
}

describe("manual presentation", () => {
  it("builds one renderer model with per-slide manifests and exact item filters", () => {
    const document = documentFixture();
    const { deck, menu } = buildManualPresentationRenderModel(document, {
      assetUrls: { [photoAssetId]: "https://example.com/food.jpg" }
    });

    expect(deck.slides).toHaveLength(2);
    expect(deck.slides[0]?.templateId).toBe(`manual-${firstSlideId}`);
    expect(deck.slides[0]?.menuItemIds).toEqual([firstItemId]);
    expect(deck.slides[1]?.menuItemIds).toEqual([secondItemId]);
    expect(deck.templateManifests).toHaveProperty(`manual-${firstSlideId}`);
    expect(deck.templateManifests).toHaveProperty(`manual-${secondSlideId}`);
    expect(deck.assetIds).toEqual([photoAssetId]);
    expect(deck.assetUrls[photoAssetId]).toBe("https://example.com/food.jpg");
    expect(menu.sections.flatMap((section) => section.items)).toHaveLength(2);
  });

  it("supports the multi-group day overview slide and skips blank slots", () => {
    const slideId = "99999999-9999-4999-8999-999999999990";
    const items = createManualPresentationSlideItems("masico-intro");
    // 2 polévky + 5 hlavních + 1 menu dne = 8 kolonek
    expect(items).toHaveLength(8);

    items[0]!.name = "Hovězí vývar";
    items[0]!.priceCzk = 39;
    items[2]!.name = "Svíčková";
    items[2]!.priceCzk = 169;
    items[7]!.name = "Menu dne: řízek + kaše";
    items[7]!.priceCzk = 149;

    const document: ManualPresentationDocument = {
      ...documentFixture(),
      slides: [
        {
          id: slideId,
          title: "Denní menu",
          baseTemplateId: "masico-intro",
          durationSeconds: 12,
          manifest: createManualPresentationManifest("masico-intro", slideId),
          items
        }
      ]
    };

    const { deck, menu } = buildManualPresentationRenderModel(document);
    // Jen vyplněné kolonky — prázdné sloty TvComposition schová.
    expect(deck.slides[0]?.menuItemIds).toHaveLength(3);
    const byId = new Map(menu.sections.map((section) => [section.id, section]));
    expect(byId.get("soups")?.items.map((i) => i.name)).toEqual(["Hovězí vývar"]);
    expect(byId.get("mains")?.items.map((i) => i.name)).toEqual(["Svíčková"]);
    expect(byId.get("special")?.items.map((i) => i.name)).toEqual(["Menu dne: řízek + kaše"]);
  });

  it("rejects a slide whose group exceeds the slot capacity", () => {
    const document = documentFixture();
    const base = document.slides[1]!.items[0]!;
    document.slides[1]!.items = [
      base,
      { ...base, id: "99999999-9999-4999-8999-999999999991" },
      { ...base, id: "99999999-9999-4999-8999-999999999992" },
      { ...base, id: "99999999-9999-4999-8999-999999999993" }
    ];

    expect(manualPresentationDocumentSchema.safeParse(document).success).toBe(false);
  });

  it("rejects a slide with no filled item", () => {
    const document = documentFixture();
    document.slides[0]!.items = [item({ id: firstItemId, sectionKey: "mains" })];

    expect(manualPresentationDocumentSchema.safeParse(document).success).toBe(false);
  });

  it("pads legacy slides to the full slot count and keeps filled items first", () => {
    const legacy = documentFixture().slides[0]!;
    const padded = padManualSlideItems(legacy.items, "mains-grid");

    expect(padded).toHaveLength(5);
    expect(padded[0]?.id).toBe(firstItemId);
    expect(padded[0]?.sectionKey).toBe("mains");
    expect(padded.slice(1).every((slot) => slot.name === "")).toBe(true);
  });

  it("creates an auditable source text snapshot without blank slots", () => {
    const document = documentFixture();
    document.slides[0]!.items = padManualSlideItems(document.slides[0]!.items, "mains-grid");
    const text = manualPresentationSourceText(document);

    expect(text).toContain("Kuřecí řízek | 159 Kč | alergeny 1,3,7");
    expect(text).not.toContain("| bez ceny | alergeny bez alergenů\n | ");
  });

  it("rejects a non-integer or out-of-range price", () => {
    for (const price of [129.5, -5, 1_000_001]) {
      const document = documentFixture();
      document.slides[0]!.items[0]!.priceCzk = price;
      expect(manualPresentationDocumentSchema.safeParse(document).success).toBe(false);
    }
  });

  it("rejects a template id that does not belong to its slide", () => {
    const document = documentFixture();
    document.slides[0]!.manifest.id = "daily-menu";

    expect(manualPresentationDocumentSchema.safeParse(document).success).toBe(false);
  });
});
