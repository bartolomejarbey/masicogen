import { describe, expect, it } from "vitest";
import { auditDeck, BLOCKING_AUDIT_CODES, type AuditIssue } from "./deck-audit";
import { buildDailyDeckManifest } from "./deck-builder";
import { demoDeck, demoMenu } from "./demo";
import { dailyLoopTemplates } from "./templates";
import type {
  MenuExtractionItem,
  MenuExtractionResult,
  TemplateManifestV2,
  TextLayerV2
} from "./schemas";

function menuItem(
  id: string,
  name: string,
  overrides: Partial<MenuExtractionItem> = {}
): MenuExtractionItem {
  return {
    id,
    name,
    description: null,
    prices: [{ label: "porce", amount: 129, currency: "CZK" }],
    allergens: ["1", "7"],
    allergensUnknown: false,
    dietaryTags: [],
    modifiers: [],
    available: true,
    highlight: false,
    photoAssetId: null,
    sourceRefs: [],
    confidence: 0.95,
    ...overrides
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
          menuItem("s1", "Hovězí vývar s nudlemi", {
            photoAssetId: "11111111-1111-4111-8111-111111111111"
          }),
          menuItem("s2", "Gulášová polévka")
        ]
      },
      {
        id: "mains",
        name: "Hlavní jídla",
        items: [
          menuItem("m1", "Svíčková na smetaně"),
          menuItem("m2", "Smažený řízek"),
          menuItem("m3", "Hovězí guláš"),
          menuItem("m4", "Zeleninové rizoto"),
          menuItem("m5", "Caesar salát")
        ]
      },
      { id: "pizza", name: "Pizza dne", items: [menuItem("p1", "Pizza Prosciutto")] },
      {
        id: "buffet",
        name: "Teplý bufet",
        items: [menuItem("b1", "Kuřecí stehno"), menuItem("b2", "Pečené brambory")]
      },
      { id: "desserts", name: "Dezerty", items: [menuItem("d1", "Domácí štrúdl")] }
    ]
  };
}

function cloneTemplates(): TemplateManifestV2[] {
  return structuredClone(dailyLoopTemplates);
}

function textLayer(template: TemplateManifestV2, id: string): TextLayerV2 {
  const layer = template.layers.find((candidate) => candidate.id === id);
  if (!layer || layer.type !== "text") {
    throw new Error(`Textová vrstva ${id} v šabloně ${template.id} nenalezena.`);
  }
  return layer;
}

function errors(issues: AuditIssue[]) {
  return issues.filter((issue) => issue.severity === "error");
}

describe("auditDeck", () => {
  it("čisté menu neprodukuje žádný error", () => {
    const menu = fullMenu();
    const deck = buildDailyDeckManifest(menu);

    const issues = auditDeck(deck, menu, { today: "2026-07-08" });

    expect(errors(issues)).toEqual([]);
  });

  it("položka bez ceny → missing_price error s itemId", () => {
    const menu = fullMenu();
    menu.sections[1].items[0].prices = [{ label: "porce", amount: null, currency: "CZK" }];
    const deck = buildDailyDeckManifest(menu);

    const issues = auditDeck(deck, menu);
    const issue = issues.find((candidate) => candidate.code === "missing_price");

    expect(issue?.severity).toBe("error");
    expect(issue?.itemId).toBe("m1");
    expect(issue?.message).toContain("Svíčková na smetaně");
  });

  it("neověřené alergeny → missing_allergens error s itemId", () => {
    const menu = fullMenu();
    menu.sections[1].items[1].allergensUnknown = true;
    const deck = buildDailyDeckManifest(menu);

    const issues = auditDeck(deck, menu);
    const issue = issues.find((candidate) => candidate.code === "missing_allergens");

    expect(issue?.severity).toBe("error");
    expect(issue?.itemId).toBe("m2");
  });

  it("nízká jistota extrakce → low_confidence warning", () => {
    const menu = fullMenu();
    menu.sections[0].items[1].confidence = 0.5;
    const deck = buildDailyDeckManifest(menu);

    const issues = auditDeck(deck, menu);
    const issue = issues.find((candidate) => candidate.code === "low_confidence");

    expect(issue?.severity).toBe("warning");
    expect(issue?.itemId).toBe("s2");
  });

  it("extrémně dlouhý název (150+ znaků) → text_overflow warning s ratio a resolvedText", () => {
    const longName = "Dlouhý název jídla ".repeat(8).trim();
    const menu = fullMenu();
    menu.sections[1].items[0].name = longName;
    const deck = buildDailyDeckManifest(menu);

    const issues = auditDeck(deck, menu);
    const issue = issues.find(
      (candidate) =>
        candidate.code === "text_overflow" &&
        candidate.slideId === "slide-mains" &&
        candidate.itemId === "m1"
    );

    expect(issue?.severity).toBe("warning");
    expect(issue?.layerId).toBe("main-0-name");
    expect(issue?.meta?.ratio as number).toBeGreaterThan(1);
    expect(issue?.meta?.resolvedText).toBe(longName);
  });

  it("název těsně pod hranicí místa → text_overflow info", () => {
    const menu = fullMenu();
    // 35 znaků na buffet řádku (w=1010, 46 px, tučně) → ratio ≈ 0,89.
    menu.sections[3].items[0].name = "Zapečené brambory se smetanou extra";
    const deck = buildDailyDeckManifest(menu);

    const issues = auditDeck(deck, menu);
    const issue = issues.find(
      (candidate) => candidate.code === "text_overflow" && candidate.itemId === "b1"
    );

    expect(issue?.severity).toBe("info");
    const ratio = issue?.meta?.ratio as number;
    expect(ratio).toBeGreaterThanOrEqual(0.85);
    expect(ratio).toBeLessThanOrEqual(1);
  });

  it("menu bez hlavních jídel → missing_required_slide error", () => {
    const menu = fullMenu();
    menu.sections = menu.sections.filter((section) => section.id !== "mains");
    const deck = buildDailyDeckManifest(menu);

    const issues = auditDeck(deck, menu);
    const issue = issues.find((candidate) => candidate.code === "missing_required_slide");

    expect(issue?.severity).toBe("error");
    expect(issue?.meta?.slideKey).toBe("mains");
    expect(issue?.message).toContain("Hlavní jídla");
  });

  it("menu na jiný den než dnes → date_mismatch error; shodný den nic", () => {
    const menu = fullMenu();
    const deck = buildDailyDeckManifest(menu);

    const mismatch = auditDeck(deck, menu, { today: "2026-07-09" });
    const issue = mismatch.find((candidate) => candidate.code === "date_mismatch");
    expect(issue?.severity).toBe("error");
    expect(issue?.meta).toEqual({ menuDate: "2026-07-08", today: "2026-07-09" });

    const matching = auditDeck(deck, menu, { today: "2026-07-08" });
    expect(matching.some((candidate) => candidate.code === "date_mismatch")).toBe(false);
  });

  it("slide kratší než 3 sekundy → loop_duration warning se slideId", () => {
    const menu = fullMenu();
    const deck = buildDailyDeckManifest(menu);
    const soups = deck.slides.find((slide) => slide.id === "slide-soups");
    if (!soups) {
      throw new Error("slide-soups chybí");
    }
    soups.durationFrames = 60; // 2 s

    const issues = auditDeck(deck, menu);
    const issue = issues.find(
      (candidate) => candidate.code === "loop_duration" && candidate.slideId === "slide-soups"
    );

    expect(issue?.severity).toBe("warning");
    expect(issue?.meta?.seconds).toBe(2);
  });

  it("smyčka přes 5 minut → loop_duration error", () => {
    const menu = fullMenu();
    const deck = buildDailyDeckManifest(menu, {
      slideDurationsSeconds: { intro: 60, soups: 60, mains: 60, pizza: 60, buffet: 60, special: 60 }
    });

    const issues = auditDeck(deck, menu);
    const issue = issues.find(
      (candidate) => candidate.code === "loop_duration" && candidate.severity === "error"
    );

    expect(issue).toBeTruthy();
    expect(issue?.meta?.seconds).toBe(360);
  });

  it("smyčka pod 20 sekund → loop_duration warning bez slideId", () => {
    const menu = fullMenu();
    menu.sections = menu.sections.filter((section) => ["soups", "mains"].includes(section.id));
    const deck = buildDailyDeckManifest(menu, {
      slideDurationsSeconds: { intro: 3, soups: 3, mains: 3 }
    });

    const issues = auditDeck(deck, menu);
    const issue = issues.find(
      (candidate) =>
        candidate.code === "loop_duration" &&
        candidate.severity === "warning" &&
        !candidate.slideId
    );

    expect(issue?.meta?.seconds).toBe(9);
    expect(errors(issues)).toEqual([]);
  });

  it("jídlo bez fotky na šabloně s requirePhotos=warn → missing_photo warning", () => {
    const menu = fullMenu();
    const deck = buildDailyDeckManifest(menu);

    const issues = auditDeck(deck, menu);
    const issue = issues.find(
      (candidate) => candidate.code === "missing_photo" && candidate.itemId === "s2"
    );

    expect(issue?.severity).toBe("warning");
    expect(issue?.slideId).toBe("slide-soups");
    expect(issue?.message).toContain("Gulášová polévka");
    // s1 fotku má — hlásit se nesmí.
    expect(
      issues.some((candidate) => candidate.code === "missing_photo" && candidate.itemId === "s1")
    ).toBe(false);
  });

  it("méně položek, než šablona čeká → items_out_of_range warning", () => {
    const menu = fullMenu();
    menu.sections[1].items = menu.sections[1].items.slice(0, 2); // mains-grid má minItems 3
    const deck = buildDailyDeckManifest(menu);

    const issues = auditDeck(deck, menu);
    const issue = issues.find(
      (candidate) => candidate.code === "items_out_of_range" && candidate.slideId === "slide-mains"
    );

    expect(issue?.severity).toBe("warning");
    expect(issue?.meta).toEqual({ count: 2, minItems: 3, maxItems: 5 });
  });

  it("deck bez v2 šablon → legacy_template info a žádné vizuální kontroly", () => {
    const issues = auditDeck(demoDeck, demoMenu);

    const legacy = issues.filter((candidate) => candidate.code === "legacy_template");
    expect(legacy).toHaveLength(demoDeck.slides.length);
    expect(legacy.every((candidate) => candidate.severity === "info")).toBe(true);

    const visualCodes = ["text_overflow", "low_contrast", "text_on_photo", "missing_photo", "small_font"];
    expect(issues.some((candidate) => visualCodes.includes(candidate.code))).toBe(false);
  });

  it("krémový text na krémové kartě → low_contrast warning (nikdy error)", () => {
    const templates = cloneTemplates();
    const soupsTemplate = templates.find((template) => template.id === "soups-duo");
    if (!soupsTemplate) {
      throw new Error("šablona soups-duo chybí");
    }
    textLayer(soupsTemplate, "soup-0-name").color = "#f6f3ee";

    const menu = fullMenu();
    const deck = buildDailyDeckManifest(menu, { templates });
    const issues = auditDeck(deck, menu);

    const issue = issues.find(
      (candidate) => candidate.code === "low_contrast" && candidate.layerId === "soup-0-name"
    );
    expect(issue?.severity).toBe("warning");
    expect(issue?.meta?.contrast as number).toBeLessThan(3);
    // Rozhodnutí 8: kontrast v provozním auditu nikdy neblokuje.
    expect(
      issues.every((candidate) => candidate.code !== "low_contrast" || candidate.severity === "warning")
    ).toBe(true);
  });

  it("text přímo na fotce bez ztmavení → text_on_photo info", () => {
    const templates = cloneTemplates();
    const soupsTemplate = templates.find((template) => template.id === "soups-duo");
    if (!soupsTemplate) {
      throw new Error("šablona soups-duo chybí");
    }
    const nameLayer = textLayer(soupsTemplate, "soup-0-name");
    nameLayer.frame = { ...nameLayer.frame, y: 400, zIndex: 3 }; // posun doprostřed fotky

    const menu = fullMenu();
    const deck = buildDailyDeckManifest(menu, { templates });
    const issues = auditDeck(deck, menu);

    const issue = issues.find(
      (candidate) => candidate.code === "text_on_photo" && candidate.layerId === "soup-0-name"
    );
    expect(issue?.severity).toBe("info");
    expect(issue?.meta?.photoLayerId).toBe("soup-0-photo");
  });

  it("povinný slide vázaný na sekci, která v menu není → dead_binding info", () => {
    const deck = buildDailyDeckManifest(demoMenu); // demoMenu nemá sekci special
    const issues = auditDeck(deck, demoMenu);

    const issue = issues.find((candidate) => candidate.code === "dead_binding");
    expect(issue?.severity).toBe("info");
    expect(issue?.slideId).toBe("slide-intro");
    expect(issue?.meta?.sectionKey).toBe("special");
  });

  it("písmo pod minimem šablony → small_font warning", () => {
    const templates = cloneTemplates();
    const soupsTemplate = templates.find((template) => template.id === "soups-duo");
    if (!soupsTemplate) {
      throw new Error("šablona soups-duo chybí");
    }
    soupsTemplate.validationRules.minFontSizePx = 48;

    const menu = fullMenu();
    const deck = buildDailyDeckManifest(menu, { templates });
    const issues = auditDeck(deck, menu);

    const smallFonts = issues.filter(
      (candidate) => candidate.code === "small_font" && candidate.slideId === "slide-soups"
    );
    expect(smallFonts.length).toBeGreaterThan(0);
    expect(smallFonts.every((candidate) => candidate.severity === "warning")).toBe(true);
    expect(
      smallFonts.some((candidate) => candidate.layerId === "soup-0-allergens")
    ).toBe(true);
  });

  it("BLOCKING_AUDIT_CODES obsahuje právě tři provozně blokující kódy", () => {
    expect([...BLOCKING_AUDIT_CODES]).toEqual([
      "missing_price",
      "missing_allergens",
      "date_mismatch"
    ]);
  });
});
