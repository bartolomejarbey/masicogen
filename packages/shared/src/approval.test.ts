import { describe, expect, it } from "vitest";
import { evaluatePublishReadiness } from "./approval";
import { demoDeck, demoMenu } from "./demo";
import { defaultTemplateManifests } from "./templates";

const verifiedExport = {
  available: true,
  label: "Lokální demo MP4 export je ověřený ffprobe."
};

describe("evaluatePublishReadiness", () => {
  it("requires manual approval even when validation passes", () => {
    const readiness = evaluatePublishReadiness({
      menu: demoMenu,
      deck: demoDeck,
      templates: defaultTemplateManifests,
      exportEvidence: verifiedExport
    });

    expect(readiness.status).toBe("needs_approval");
    expect(readiness.canPublish).toBe(false);
    expect(readiness.pendingApprovals).toEqual(["content", "layout", "export"]);
  });

  it("allows publish only after all manual gates are approved", () => {
    const readiness = evaluatePublishReadiness({
      menu: demoMenu,
      deck: demoDeck,
      templates: defaultTemplateManifests,
      exportEvidence: verifiedExport,
      manualApprovals: {
        content: true,
        layout: true,
        export: true
      }
    });

    expect(readiness.status).toBe("ready");
    expect(readiness.canPublish).toBe(true);
    expect(readiness.blockers).toHaveLength(0);
  });

  it("blocks content approval when allergens are missing", () => {
    const menu = {
      ...demoMenu,
      sections: demoMenu.sections.map((section) => ({
        ...section,
        items: section.items.map((item, index) =>
          index === 0
            ? {
                ...item,
                allergens: [],
                allergensUnknown: true
              }
            : item
        )
      }))
    };
    const readiness = evaluatePublishReadiness({
      menu,
      deck: demoDeck,
      templates: defaultTemplateManifests,
      exportEvidence: verifiedExport,
      manualApprovals: {
        content: true,
        layout: true,
        export: true
      }
    });

    expect(readiness.status).toBe("blocked");
    expect(readiness.canPublish).toBe(false);
    expect(readiness.blockers.some((issue) => issue.code === "missing_allergens")).toBe(true);
  });

  it("blocks publish when no verified MP4 export exists", () => {
    const readiness = evaluatePublishReadiness({
      menu: demoMenu,
      deck: demoDeck,
      templates: defaultTemplateManifests,
      exportEvidence: {
        available: false,
        label: "Export zatím nebyl vytvořen."
      },
      manualApprovals: {
        content: true,
        layout: true,
        export: true
      }
    });

    expect(readiness.status).toBe("blocked");
    expect(readiness.blockers.some((issue) => issue.code === "missing_export")).toBe(true);
  });

  it("blocks layout approval when the allergen legend is missing", () => {
    const deck = {
      ...demoDeck,
      slides: demoDeck.slides.filter((slide) => slide.templateId !== "allergen-legend")
    };
    const readiness = evaluatePublishReadiness({
      menu: demoMenu,
      deck,
      templates: defaultTemplateManifests,
      exportEvidence: verifiedExport,
      manualApprovals: {
        content: true,
        layout: true,
        export: true
      }
    });

    expect(readiness.status).toBe("blocked");
    expect(readiness.blockers.some((issue) => issue.code === "missing_allergen_legend")).toBe(true);
  });
});
