import { type AllergenCode, allergenCodeSchema } from "./allergens";
import { type MenuExtractionResult } from "./schemas";

const sectionHints = [
  { id: "soups", name: "Polévky", patterns: [/^pol[ée]vky?$/i, /^soup/i] },
  { id: "pizza", name: "Pizza dne", patterns: [/^pizza/i] },
  { id: "buffet", name: "Teplý bufet", patterns: [/bufet|buffet/i, /^tepl[yý]/i] },
  { id: "mains", name: "Hlavní jídla", patterns: [/^hlavn[ií]/i, /^menu$/i, /^j[ií]dla$/i] },
  { id: "specials", name: "Special nabídka", patterns: [/special/i, /akce/i] },
  { id: "desserts", name: "Dezerty", patterns: [/dezert/i, /mou[cč]n/i] }
];

const promptInjectionPatterns = [
  /ignore (all )?(previous|above) instructions/i,
  /ignoruj (předchozí|všechny) instrukce/i,
  /system prompt/i,
  /developer message/i,
  /api key/i
];

export function parsePastedMenuText(input: string, date = "2026-07-06"): MenuExtractionResult {
  const warnings: string[] = [];
  const sections = new Map<
    string,
    { id: string; name: string; items: MenuExtractionResult["sections"][number]["items"] }
  >();
  let currentSection:
    | { id: string; name: string; items: MenuExtractionResult["sections"][number]["items"] }
    | null = null;

  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    warnings.push("Nebyl vložen žádný text menu.");
  }

  for (const line of lines) {
    if (promptInjectionPatterns.some((pattern) => pattern.test(line))) {
      warnings.push("Text obsahuje možný prompt injection. Byl zpracován pouze jako obsah menu.");
      continue;
    }

    const section = detectSection(line);
    if (section) {
      currentSection = ensureSection(sections, section.id, section.name);
      continue;
    }

    const targetSection = currentSection ?? ensureSection(sections, "mains", "Hlavní jídla");
    const item = parseMenuLine(line, targetSection.items.length);
    if (!item.name) {
      warnings.push(`Řádek nebyl rozpoznán jako položka: ${line}`);
      continue;
    }

    targetSection.items.push(item);
  }

  const parsedSections = Array.from(sections.values()).filter((section) => section.items.length > 0);
  for (const section of parsedSections) {
    for (const item of section.items) {
      if (item.prices.some((price) => price.amount === null)) {
        warnings.push(`${item.name}: chybí cena.`);
      }
      if (item.allergensUnknown || item.allergens.length === 0) {
        warnings.push(`${item.name}: alergeny nejsou ověřené.`);
      }
    }
  }

  return {
    restaurant: {
      name: "MASI-CO food",
      locale: "cs-CZ",
      currency: "CZK"
    },
    date,
    locationName: "Jídelna MASI-CO",
    sections: parsedSections,
    warnings
  };
}

function ensureSection(
  sections: Map<
    string,
    { id: string; name: string; items: MenuExtractionResult["sections"][number]["items"] }
  >,
  id: string,
  name: string
) {
  const existing = sections.get(id);
  if (existing) {
    return existing;
  }

  const section = { id, name, items: [] };
  sections.set(id, section);
  return section;
}

function detectSection(line: string) {
  // Řádek s cenou je vždy položka, i když začíná názvem sekce („Pizza Prosciutto 165 Kč").
  if (/(?:^|\s)\d{2,4}(?:[,.]\d{1,2})?\s*(?:k[cč]|,-)/i.test(line)) {
    return null;
  }

  const normalized = line.replace(/[:\-]+$/, "").trim();
  return sectionHints.find((hint) => hint.patterns.some((pattern) => pattern.test(normalized))) ?? null;
}

function parseMenuLine(line: string, index: number) {
  const priceMatch = line.match(/(?:^|\s)(\d{2,4})(?:[,.]\d{1,2})?\s*(?:k[cč]|,-)/i);
  const allergenMatch = line.match(
    /(?:alergeny?|al\.?|obsahuje)\s*[:.]?\s*((?:\d{1,2}\s*[,/ ]?\s*)+)/i
  );
  const allergens = parseAllergens(allergenMatch?.[1] ?? "");
  const price = priceMatch ? Number(priceMatch[1]) : null;
  const name = cleanupItemName(line, priceMatch?.[0] ?? "", allergenMatch?.[0] ?? "");
  const confidence = calculateConfidence(price, allergens, allergenMatch?.[0] ?? "");

  return {
    id: `${slugify(name || "polozka")}-${index + 1}`,
    name,
    shortName: shortenName(name),
    description: null,
    prices: [{ label: "porce", amount: price, currency: "CZK" as const }],
    allergens,
    allergensUnknown: allergens.length === 0,
    dietaryTags: [],
    modifiers: [],
    available: true,
    highlight: false,
    sourceRefs: [{ text: line }],
    confidence
  };
}

function parseAllergens(value: string) {
  const codes = value.match(/\d{1,2}/g) ?? [];
  const validCodes: AllergenCode[] = [];

  for (const code of codes) {
    const parsed = allergenCodeSchema.safeParse(String(Number(code)));
    if (parsed.success && !validCodes.includes(parsed.data)) {
      validCodes.push(parsed.data);
    }
  }

  return validCodes;
}

function cleanupItemName(line: string, priceText: string, allergenText: string) {
  return line
    .replace(priceText, "")
    .replace(allergenText, "")
    .replace(/^\s*[-–•]\s*/, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+[,;:-]\s*$/, "")
    .trim();
}

function calculateConfidence(price: number | null, allergens: AllergenCode[], allergenText: string) {
  let confidence = 0.54;
  if (price !== null) {
    confidence += 0.22;
  }
  if (allergens.length > 0) {
    confidence += 0.18;
  }
  if (/alergeny?|al\.?|obsahuje/i.test(allergenText)) {
    confidence += 0.04;
  }

  return Math.min(confidence, 0.98);
}

function shortenName(name: string) {
  if (name.length <= 28) {
    return name;
  }

  return name.slice(0, 25).trimEnd();
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
