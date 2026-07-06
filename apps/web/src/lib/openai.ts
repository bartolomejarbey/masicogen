import { menuExtractionResultSchema, type MenuExtractionResult } from "@masico/shared";
import { z } from "zod";
import { demoDataEnabled } from "./security";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_IMAGE_SIZE = "1536x864";

export async function extractMenuWithOpenAI(input: {
  text: string;
  dateHint?: string;
}): Promise<MenuExtractionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL ?? "gpt-5.4-mini",
      store: false,
      input: [
        {
          role: "system",
          content:
            "Jsi extraktor jidelnicku pro ceskou jidelnu. Vracej pouze data ze zdroje. Nikdy nevymyslej ceny, alergeny, dietni tvrzeni ani dostupnost. Nejasne hodnoty nastav na null a pridej warning."
        },
        {
          role: "user",
          content: `Datum hint: ${input.dateHint ?? "neuvedeno"}\n\nZdrojovy text:\n${input.text}`
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "masico_menu_extraction",
          schema: z.toJSONSchema(menuExtractionResultSchema)
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI extraction failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  const rawJson =
    payload.output_text ??
    payload.output?.flatMap((item) => item.content ?? []).find((item) => item.text)?.text;

  if (!rawJson) {
    throw new Error("OpenAI response did not contain structured output text.");
  }

  return menuExtractionResultSchema.parse(JSON.parse(rawJson));
}

export async function generateBackgroundImage(input: {
  prompt: string;
  quality: "draft" | "final";
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const safePrompt = [
    input.prompt,
    "16:9 digital menu background for a Czech cafeteria.",
    "No words, no numbers, no logos, no menu boards, no readable labels.",
    "Leave a clean high-contrast empty area for deterministic text overlay."
  ].join(" ");

  const response = await fetch(`${OPENAI_BASE_URL}/images/generations`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
      prompt: safePrompt,
      size: getOpenAIImageSize(),
      quality: input.quality === "final" ? "high" : "low",
      output_format: "png"
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `OpenAI image generation failed: ${response.status}${detail ? ` ${detail.slice(0, 500)}` : ""}`
    );
  }

  return response.json() as Promise<{
    data?: Array<{ b64_json?: string; url?: string }>;
  }>;
}

export function getOpenAIImageDimensions() {
  const [width, height] = getOpenAIImageSize().split("x").map((part) => Number.parseInt(part, 10));

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    const [fallbackWidth, fallbackHeight] = DEFAULT_OPENAI_IMAGE_SIZE
      .split("x")
      .map((part) => Number.parseInt(part, 10));

    return {
      width: fallbackWidth,
      height: fallbackHeight
    };
  }

  return {
    width,
    height
  };
}

function getOpenAIImageSize() {
  return process.env.OPENAI_IMAGE_SIZE ?? DEFAULT_OPENAI_IMAGE_SIZE;
}

export async function createAssistantText(message: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    if (!demoDataEnabled()) {
      throw new Error("OPENAI_API_KEY is missing.");
    }

    return [
      "AI asistent je v demo režimu, protože chybí OPENAI_API_KEY.",
      "Navržená změna: zkraťte dlouhé názvy pro TV a ponechte ceny i alergeny beze změny.",
      "Pro generování backgroundu použijte prompt bez textu, čísel a log."
    ].join("\n");
  }

  const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL ?? "gpt-5.4-mini",
      store: false,
      input: [
        {
          role: "system",
          content:
            "Jsi cesky AI asistent pro MASI-CO TV Studio. Navrhuj zmeny jako auditovatelne kroky. Nikdy potichu nemen ceny, alergeny, datum ani nazvy jidla. Vysvetli, co vyzaduje schvaleni."
        },
        {
          role: "user",
          content: message
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI chat failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };

  return (
    payload.output_text ??
    payload.output?.flatMap((item) => item.content ?? []).find((item) => item.text)?.text ??
    "Nemám výstup z modelu. Zkuste prosím požadavek upřesnit."
  );
}
