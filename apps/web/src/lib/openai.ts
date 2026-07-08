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

/**
 * Provizorní fotka jídla pro TV smyčku — jednotný styl, dokud personál
 * nenahraje vlastní fotku.
 */
export async function generateDishPhoto(input: {
  dishName: string;
  description?: string | null;
  quality?: "low" | "medium" | "high";
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const prompt = [
    `Professional food photography of the Czech canteen dish: "${input.dishName}".`,
    input.description ? `Details: ${input.description}.` : "",
    "Served on a simple white ceramic plate, shot from a 45-degree angle,",
    "warm appetizing daylight, shallow depth of field, neutral dark slate table,",
    "authentic honest Czech cafeteria portion, photorealistic.",
    "No text, no numbers, no people, no hands, no logos, no cutlery brands."
  ]
    .filter(Boolean)
    .join(" ");

  const response = await fetch(`${OPENAI_BASE_URL}/images/generations`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
      prompt,
      size: "1024x1024",
      quality: input.quality ?? "medium",
      output_format: "png"
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `OpenAI dish photo failed: ${response.status}${detail ? ` ${detail.slice(0, 500)}` : ""}`
    );
  }

  return response.json() as Promise<{
    data?: Array<{ b64_json?: string; url?: string }>;
  }>;
}

/**
 * Vystřižení pozadí nahrané fotky: zůstane jen jídlo (talíř) na průhledném
 * pozadí. Jídlo samotné se nesmí nijak měnit.
 */
export async function removeDishPhotoBackground(input: {
  image: Buffer;
  mimeType: string;
  fileName?: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const form = new FormData();
  form.append("model", process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2");
  form.append(
    "prompt",
    [
      "Remove the background completely and keep ONLY the plated food from the photo,",
      "perfectly preserved and unchanged (same dish, same plate, same angle, same lighting).",
      "Output the isolated dish on a fully transparent background.",
      "Do not add anything, do not restyle the food."
    ].join(" ")
  );
  form.append("background", "transparent");
  form.append("size", "1024x1024");
  form.append("output_format", "png");
  form.append(
    "image",
    new Blob([new Uint8Array(input.image)], { type: input.mimeType }),
    input.fileName ?? "dish.png"
  );

  const response = await fetch(`${OPENAI_BASE_URL}/images/edits`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `OpenAI background removal failed: ${response.status}${detail ? ` ${detail.slice(0, 500)}` : ""}`
    );
  }

  return response.json() as Promise<{
    data?: Array<{ b64_json?: string }>;
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
