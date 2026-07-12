import { describe, expect, it } from "vitest";
import {
  menuExtractionJsonSchema,
  parseWeekExtractionOutput,
  slideGenerationJsonSchema,
  weekExtractionJsonSchema
} from "./openai";

/**
 * OpenAI structured outputs (strict mode) odmítnou celý request, pokud
 * kterýkoli objekt ve schématu nemá `required` se VŠEMI klíči z `properties`
 * a `additionalProperties: false`. Přesně tahle chyba položila týdenní
 * import (400 invalid_json_schema) — test ji drží mrtvou.
 */
function assertOpenAiStrict(node: unknown, path: string) {
  if (!node || typeof node !== "object") {
    return;
  }
  const record = node as Record<string, unknown>;

  if (record.type === "object" && record.properties && typeof record.properties === "object") {
    const keys = Object.keys(record.properties as Record<string, unknown>).sort();
    const required = Array.isArray(record.required) ? [...(record.required as string[])].sort() : [];
    expect(record.additionalProperties, `${path}: additionalProperties`).toBe(false);
    expect(required, `${path}: required musí obsahovat všechna pole`).toEqual(keys);
  }

  for (const [key, value] of Object.entries(record)) {
    if (value && typeof value === "object") {
      assertOpenAiStrict(value, `${path}.${key}`);
    }
  }
}

describe("openai extraction schemas", () => {
  it("week extraction JSON schema is OpenAI-strict", () => {
    assertOpenAiStrict(weekExtractionJsonSchema(), "week");
  });

  it("menu extraction JSON schema is OpenAI-strict", () => {
    assertOpenAiStrict(menuExtractionJsonSchema(), "menu");
  });

  it("slide generation JSON schema is OpenAI-strict", () => {
    assertOpenAiStrict(slideGenerationJsonSchema(), "slide");
  });

  it("parses a realistic LLM week payload into the internal shape", () => {
    const llmPayload = {
      days: [
        {
          dayOfWeek: "PO",
          isHoliday: false,
          holidayLabel: null,
          sections: [
            {
              id: "soups",
              name: "Polévky",
              items: [
                {
                  name: "Hovězí vývar s masovou zavářkou",
                  description: null,
                  prices: [{ label: "porce", amount: 40 }],
                  allergens: ["1", "3", "6", "9"],
                  allergensUnknown: false,
                  highlight: false
                }
              ]
            },
            {
              id: "mains",
              name: "Hlavní jídla",
              items: [
                {
                  name: "Segedínský guláš, houskový knedlík",
                  description: null,
                  // cena mimo rozsah 0–500 se nuluje s warningem, alergen "99" se zahodí
                  prices: [{ label: "porce", amount: 14500 }],
                  allergens: ["1", "99", "7"],
                  allergensUnknown: false,
                  highlight: false
                }
              ]
            }
          ],
          warnings: []
        },
        { dayOfWeek: "UT", isHoliday: true, holidayLabel: "Státní svátek", sections: null, warnings: [] },
        { dayOfWeek: "ST", isHoliday: false, holidayLabel: null, sections: [], warnings: [] },
        { dayOfWeek: "CT", isHoliday: false, holidayLabel: null, sections: [], warnings: [] },
        { dayOfWeek: "PA", isHoliday: false, holidayLabel: null, sections: [], warnings: [] }
      ]
    };

    const result = parseWeekExtractionOutput(JSON.stringify(llmPayload), "2026-07-13");

    expect(result.weekStart).toBe("2026-07-13");
    expect(result.days).toHaveLength(5);

    const monday = result.days[0]!;
    expect(monday.menu?.sections[0]?.items[0]?.name).toBe("Hovězí vývar s masovou zavářkou");
    expect(monday.menu?.sections[0]?.items[0]?.id).toBe("item-0-0");

    const gulas = monday.menu?.sections[1]?.items[0];
    expect(gulas?.prices[0]?.amount).toBeNull();
    expect(gulas?.allergens).toEqual(["1", "7"]);
    expect(monday.warnings.length).toBeGreaterThan(0);

    expect(result.days[1]?.isHoliday).toBe(true);
    expect(result.days[1]?.menu).toBeNull();
  });
});
