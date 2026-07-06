import { describe, expect, it } from "vitest";
import { demoDeck, demoMenu } from "./demo";
import { defaultTemplateManifests } from "./templates";
import { validateDeckAgainstTemplates, validateMenuForApproval } from "./validation";

describe("validation", () => {
  it("accepts the demo menu for approval", () => {
    const issues = validateMenuForApproval(demoMenu);

    expect(issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("requires the allergen legend slide", () => {
    const deck = {
      ...demoDeck,
      slides: demoDeck.slides.filter((slide) => slide.templateId !== "allergen-legend")
    };

    const issues = validateDeckAgainstTemplates(deck, defaultTemplateManifests);

    expect(issues.some((issue) => issue.code === "missing_allergen_legend")).toBe(true);
  });

  it("blocks slides that exceed the template item limit", () => {
    const deck = {
      ...demoDeck,
      slides: demoDeck.slides.map((slide) =>
        slide.id === "slide-daily"
          ? {
              ...slide,
              menuItemIds: [
                "item-1",
                "item-2",
                "item-3",
                "item-4",
                "item-5",
                "item-6"
              ]
            }
          : slide
      )
    };

    const issues = validateDeckAgainstTemplates(deck, defaultTemplateManifests);

    expect(issues.some((issue) => issue.code === "too_many_items")).toBe(true);
  });
});
