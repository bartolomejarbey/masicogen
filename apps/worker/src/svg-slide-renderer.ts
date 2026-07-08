import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import {
  allergenCatalog,
  formatCzk,
  formatCzechDate,
  getAllergenLabel,
  type DeckManifest,
  type MenuExtractionResult,
  type Slide
} from "@masico/shared";
import type { RenderedSlide } from "./ffmpeg";

// Concat utility se přestěhovaly do ffmpeg.ts; re-export drží stávající importy.
export { buildConcatFile, escapeConcatPath, type RenderedSlide } from "./ffmpeg";

export async function renderDeckSlidesToPng(
  deck: DeckManifest,
  menu: MenuExtractionResult | null,
  framesDir: string
) {
  const slides = [...deck.slides].sort((a, b) => a.sortOrder - b.sortOrder);
  const renderedSlides: RenderedSlide[] = [];

  for (const [index, slide] of slides.entries()) {
    const svg = renderSlideSvg(deck, menu, slide);
    const png = new Resvg(svg, {
      fitTo: {
        mode: "width",
        value: deck.canvas.width
      },
      font: {
        loadSystemFonts: true
      }
    })
      .render()
      .asPng();
    const path = join(framesDir, `${String(index + 1).padStart(3, "0")}.png`);

    await writeFile(path, png);
    renderedSlides.push({
      durationSeconds: slide.durationFrames / deck.fps,
      path
    });
  }

  return renderedSlides;
}

function renderSlideSvg(deck: DeckManifest, menu: MenuExtractionResult | null, slide: Slide) {
  if (slide.templateId === "special-offer") {
    return renderSpecialSlide(deck, menu, slide);
  }

  if (slide.templateId === "allergen-legend") {
    return renderAllergenSlide(deck, menu, slide);
  }

  return renderMenuSlide(deck, menu, slide);
}

function renderMenuSlide(deck: DeckManifest, menu: MenuExtractionResult | null, slide: Slide) {
  const sections = getSlideSections(slide, menu);
  const rows = sections
    .flatMap((section) => section.items.map((item) => ({ item, section: section.name })))
    .slice(0, 5);
  const rowSvg = rows
    .map(({ item, section }, index) => {
      const y = 350 + index * 132;
      const name = item.shortName ?? item.name;
      const allergens = item.allergens.map(getAllergenLabel).join(", ") || "Alergeny k ověření";

      return `
        <text x="144" y="${y}" class="section">${escapeXml(section)}</text>
        <text x="144" y="${y + 42}" class="item">${escapeXml(clampText(name, 42))}</text>
        <text x="144" y="${y + 74}" class="note">${escapeXml(clampText(allergens, 64))}</text>
        <text x="1690" y="${y + 42}" class="price" text-anchor="end">${escapeXml(formatCzk(item.prices[0]?.amount ?? null))}</text>
        <line x1="144" y1="${y + 104}" x2="1690" y2="${y + 104}" stroke="rgba(25,21,19,.12)" stroke-width="3"/>
      `;
    })
    .join("");

  return wrapSvg(deck, "light", `
    <text x="144" y="150" class="kicker">${escapeXml(formatCzechDate(menu?.date ?? null))}</text>
    <text x="144" y="250" class="headline">${escapeXml(slide.title)}</text>
    ${rowSvg}
    ${renderBrand()}
  `);
}

function renderSpecialSlide(deck: DeckManifest, menu: MenuExtractionResult | null, slide: Slide) {
  const highlighted =
    getSlideSections(slide, menu)
      .flatMap((section) => section.items)
      .find((item) => slide.menuItemIds.includes(item.id)) ??
    getSlideSections(slide, menu)
      .flatMap((section) => section.items)
      .find((item) => item.highlight);
  const title = highlighted?.shortName ?? highlighted?.name ?? slide.title;
  const price = formatCzk(highlighted?.prices[0]?.amount ?? null);
  const note = highlighted?.description ?? "Poctivá kuchyně připravená dnes pro vás.";

  return wrapSvg(deck, "dark", `
    <circle cx="1540" cy="210" r="390" fill="rgba(183,28,28,.34)"/>
    <text x="144" y="210" class="kicker dark">Special menu</text>
    <text x="144" y="390" class="headline dark">${escapeXml(clampText(title, 26))}</text>
    <text x="150" y="480" class="lead dark">${escapeXml(clampText(note, 58))}</text>
    <rect x="1260" y="720" width="430" height="150" rx="16" fill="#b71c1c"/>
    <text x="1475" y="816" class="special-price" text-anchor="middle">${escapeXml(price)}</text>
    ${renderBrand(true)}
  `);
}

function renderAllergenSlide(deck: DeckManifest, menu: MenuExtractionResult | null, slide: Slide) {
  const usedCodes = new Set(
    (menu?.sections ?? []).flatMap((section) => section.items.flatMap((item) => item.allergens))
  );
  const allergens = allergenCatalog
    .filter((allergen) => usedCodes.size === 0 || usedCodes.has(allergen.code))
    .slice(0, 10);
  const legendRows = allergens
    .map((allergen, index) => {
      const column = index > 4 ? 1 : 0;
      const x = column === 0 ? 144 : 920;
      const y = 370 + (index % 5) * 92;

      return `
        <rect x="${x}" y="${y - 46}" width="86" height="58" rx="12" fill="#efe6db"/>
        <text x="${x + 43}" y="${y - 8}" class="allergen-code" text-anchor="middle">${allergen.code}</text>
        <text x="${x + 116}" y="${y - 12}" class="item small">${escapeXml(allergen.shortName)}</text>
        <text x="${x + 116}" y="${y + 22}" class="note">${escapeXml(clampText(allergen.fullName, 38))}</text>
      `;
    })
    .join("");

  return wrapSvg(deck, "light", `
    <text x="144" y="150" class="kicker">${escapeXml(formatCzechDate(menu?.date ?? null))}</text>
    <text x="144" y="250" class="headline">${escapeXml(slide.title)}</text>
    ${legendRows}
    ${renderBrand()}
  `);
}

function wrapSvg(deck: DeckManifest, mode: "light" | "dark", body: string) {
  const background =
    mode === "dark"
      ? `<rect width="1920" height="1080" fill="#171412"/><path d="M0 0H1920V1080H0Z" fill="url(#darkBg)"/>`
      : `<rect width="1920" height="1080" fill="#fbfaf6"/><path d="M0 0H1920V1080H0Z" fill="url(#lightBg)"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${deck.canvas.width}" height="${deck.canvas.height}" viewBox="0 0 1920 1080">
    <defs>
      <linearGradient id="lightBg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#fffdf9"/>
        <stop offset="0.52" stop-color="#ffffff"/>
        <stop offset="1" stop-color="#efe6db"/>
      </linearGradient>
      <linearGradient id="darkBg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#171412"/>
        <stop offset="0.58" stop-color="#34231d"/>
        <stop offset="1" stop-color="#f4efe6"/>
      </linearGradient>
      <style>
        text { font-family: Inter, Arial, sans-serif; letter-spacing: 0; }
        .kicker { fill: #b71c1c; font-size: 34px; font-weight: 900; text-transform: uppercase; }
        .kicker.dark { fill: #ffdfd7; }
        .headline { fill: #191513; font-size: 92px; font-weight: 900; }
        .headline.dark { fill: #fffaf0; font-size: 118px; }
        .lead { font-size: 42px; font-weight: 650; }
        .lead.dark { fill: rgba(255,250,240,.84); }
        .section { fill: #b71c1c; font-size: 26px; font-weight: 900; text-transform: uppercase; }
        .item { fill: #191513; font-size: 42px; font-weight: 850; }
        .item.small { font-size: 38px; }
        .note { fill: rgba(25,21,19,.7); font-size: 25px; font-weight: 650; }
        .price { fill: #191513; font-size: 52px; font-weight: 900; }
        .special-price { fill: #ffffff; font-size: 64px; font-weight: 900; }
        .brand { fill: rgba(24,21,18,.58); font-size: 28px; font-weight: 700; }
        .brand.dark { fill: rgba(255,250,240,.72); }
        .allergen-code { fill: #4d3a31; font-size: 30px; font-weight: 900; }
      </style>
    </defs>
    ${background}
    <rect x="128" y="72" width="1664" height="936" rx="0" fill="none" stroke="rgba(25,21,19,.08)" stroke-width="2" stroke-dasharray="10 10"/>
    ${body}
  </svg>`;
}

function getSlideSections(slide: Slide, menu: MenuExtractionResult | null) {
  if (!menu) {
    return [];
  }

  return menu.sections
    .filter((section) => slide.menuSectionIds.length === 0 || slide.menuSectionIds.includes(section.id))
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => slide.menuItemIds.length === 0 || slide.menuItemIds.includes(item.id)
      )
    }))
    .filter((section) => section.items.length > 0);
}

function renderBrand(dark = false) {
  return `<text x="1690" y="998" class="brand ${dark ? "dark" : ""}" text-anchor="end">MASI-CO food</text>`;
}

function clampText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
