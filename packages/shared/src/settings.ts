import { z } from "zod";
import {
  SLIDE_MAX_DURATION_SECONDS,
  SLIDE_MIN_DURATION_SECONDS,
  type DailyLoopSlideKey
} from "./deck-builder";

export const defaultFooterLegendText =
  "Alergeny: 1 obiloviny · 3 vejce · 4 ryby · 6 sója · 7 mléko · 9 celer · 10 hořčice · 12 siřičitany";

const slideDurationSchema = z
  .number()
  .int()
  .min(SLIDE_MIN_DURATION_SECONDS)
  .max(SLIDE_MAX_DURATION_SECONDS);

// `satisfies Record<DailyLoopSlideKey, ...>` hlídá, že obě mapy pokrývají
// přesně klíče denní smyčky — nový slide v deck-builderu spadne na kompilaci.
const enabledSlidesShape = {
  intro: z.boolean().default(true),
  soups: z.boolean().default(true),
  mains: z.boolean().default(true),
  pizza: z.boolean().default(true),
  buffet: z.boolean().default(true),
  special: z.boolean().default(true)
} satisfies Record<DailyLoopSlideKey, z.ZodType>;

const durationsSecondsShape = {
  intro: slideDurationSchema.optional(),
  soups: slideDurationSchema.optional(),
  mains: slideDurationSchema.optional(),
  pizza: slideDurationSchema.optional(),
  buffet: slideDurationSchema.optional(),
  special: slideDurationSchema.optional()
} satisfies Record<DailyLoopSlideKey, z.ZodType>;

export const orgSettingsSchema = z.object({
  loop: z
    .object({
      enabledSlides: z.object(enabledSlidesShape).prefault({}),
      durationsSeconds: z.object(durationsSecondsShape).default({})
    })
    .prefault({}),
  content: z
    .object({
      footerLegendText: z.string().max(200).default(defaultFooterLegendText),
      defaultSoup: z.string().max(120).default("Hovězí vývar")
    })
    .prefault({}),
  branding: z
    .object({
      logoAssetId: z.string().nullable().default(null)
    })
    .prefault({}),
  automation: z
    .object({
      autoPublish: z.boolean().default(true),
      aiPhotos: z
        .object({
          enabled: z.boolean().default(true),
          dailyLimit: z.number().int().min(0).max(200).default(20)
        })
        .prefault({})
    })
    .prefault({}),
  export: z
    .object({
      autoExportMp4: z.boolean().default(false)
    })
    .prefault({})
});

export type OrgSettings = z.infer<typeof orgSettingsSchema>;

/** Doplní defaulty; nevalidní nebo chybějící uložený JSON = čisté defaulty. */
export function resolveSettings(raw: unknown): OrgSettings {
  const parsed = orgSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : orgSettingsSchema.parse({});
}
