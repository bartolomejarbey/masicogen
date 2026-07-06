import { describe, expect, it } from "vitest";
import { buildTextMenuImportPayload, textMenuImportRequestSchema } from "./menu-import";

describe("text menu import payload", () => {
  it("validates input and builds a deterministic parsed draft", () => {
    const input = textMenuImportRequestSchema.parse({
      locationId: "00000000-0000-4000-8000-000000000002",
      canteenId: "00000000-0000-4000-8000-000000000003",
      menuDate: "2026-07-06",
      sourceText: "Polévky\nGulášová polévka 49 Kč alergeny 1, 9"
    });

    const payload = buildTextMenuImportPayload(input);

    expect(payload.itemCount).toBe(1);
    expect(payload.menu.date).toBe("2026-07-06");
    expect(payload.menu.sections[0]?.items[0]?.prices[0]?.amount).toBe(49);
    expect(payload.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("rejects missing location and oversized source text before DB work", () => {
    expect(() =>
      textMenuImportRequestSchema.parse({
        locationId: "not-a-uuid",
        canteenId: "00000000-0000-4000-8000-000000000003",
        menuDate: "2026-07-06",
        sourceText: "Řízek 159 Kč alergeny 1, 3, 7"
      })
    ).toThrow();

    expect(() =>
      textMenuImportRequestSchema.parse({
        locationId: "00000000-0000-4000-8000-000000000002",
        canteenId: "00000000-0000-4000-8000-000000000003",
        menuDate: "2026-07-06",
        sourceText: "x".repeat(20_001)
      })
    ).toThrow();
  });

  it("surfaces blocking issues for missing prices and allergens", () => {
    const input = textMenuImportRequestSchema.parse({
      locationId: "00000000-0000-4000-8000-000000000002",
      canteenId: "00000000-0000-4000-8000-000000000003",
      menuDate: "2026-07-06",
      sourceText: "Kuřecí steak s rýží\nSmažený řízek 159 Kč"
    });

    const payload = buildTextMenuImportPayload(input);
    const errorCodes = payload.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.code);

    expect(payload.itemCount).toBe(2);
    expect(errorCodes).toContain("missing_price");
    expect(errorCodes).toContain("missing_allergens");
  });
});
