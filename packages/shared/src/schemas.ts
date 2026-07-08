import { z } from "zod";
import { allergenCodeSchema } from "./allergens";

export const orgRoleSchema = z.enum([
  "owner",
  "admin",
  "editor",
  "designer",
  "approver",
  "publisher",
  "viewer"
]);

export const approvalStatusSchema = z.enum([
  "draft",
  "needs_review",
  "approved",
  "rejected",
  "published"
]);

export const renderJobStatusSchema = z.enum([
  "queued",
  "leased",
  "running",
  "retrying",
  "succeeded",
  "failed",
  "canceled"
]);

export const priceSchema = z.object({
  label: z.string().default(""),
  amount: z.number().nonnegative().nullable(),
  currency: z.literal("CZK").default("CZK")
});

export const sourceRefSchema = z.object({
  page: z.number().int().positive().optional(),
  region: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number()
    })
    .optional(),
  text: z.string().optional()
});

export const focalPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1)
});

export const menuExtractionItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string().optional(),
  description: z.string().nullable().default(null),
  prices: z.array(priceSchema).min(1),
  allergens: z.array(allergenCodeSchema).default([]),
  allergensUnknown: z.boolean().default(false),
  dietaryTags: z.array(z.string()).default([]),
  modifiers: z.array(z.string()).default([]),
  available: z.boolean().default(true),
  highlight: z.boolean().default(false),
  photoAssetId: z.string().nullable().optional(),
  photoFocalPoint: focalPointSchema.optional(),
  photoSource: z.enum(["upload", "cutout", "ai"]).optional(),
  sourceRefs: z.array(sourceRefSchema).default([]),
  confidence: z.number().min(0).max(1).default(0)
});

export const menuExtractionSectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  items: z.array(menuExtractionItemSchema)
});

export const menuExtractionResultSchema = z.object({
  restaurant: z.object({
    name: z.string().default("MASI-CO food"),
    locale: z.literal("cs-CZ").default("cs-CZ"),
    currency: z.literal("CZK").default("CZK")
  }),
  date: z.string().nullable(),
  locationName: z.string().nullable().default(null),
  sections: z.array(menuExtractionSectionSchema),
  warnings: z.array(z.string()).default([])
});

export const menuVersionSnapshotSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  locationId: z.string(),
  canteenId: z.string(),
  sourceId: z.string().nullable(),
  date: z.string(),
  status: approvalStatusSchema,
  extracted: menuExtractionResultSchema,
  approvedBy: z.string().nullable().default(null),
  approvedAt: z.string().nullable().default(null),
  createdAt: z.string()
});

export const assistantPatchOperationSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("update_menu_item"),
    itemId: z.string(),
    patch: z.object({
      name: z.string().optional(),
      shortName: z.string().optional(),
      description: z.string().nullable().optional(),
      prices: z.array(priceSchema).optional(),
      allergens: z.array(allergenCodeSchema).optional(),
      highlight: z.boolean().optional(),
      available: z.boolean().optional()
    }),
    requiresHumanApproval: z.boolean(),
    reason: z.string()
  }),
  z.object({
    operation: z.literal("split_slide"),
    slideId: z.string(),
    strategy: z.enum(["by_section", "by_item_count", "manual"]),
    requiresHumanApproval: z.boolean().default(false),
    reason: z.string()
  }),
  z.object({
    operation: z.literal("generate_background"),
    templateId: z.string(),
    prompt: z.string(),
    quality: z.enum(["draft", "final"]),
    requiresHumanApproval: z.boolean().default(true),
    reason: z.string()
  }),
  z.object({
    operation: z.literal("shorten_tv_name"),
    itemId: z.string(),
    shortName: z.string(),
    requiresHumanApproval: z.boolean().default(true),
    reason: z.string()
  }),
  z.object({
    operation: z.literal("mark_sold_out"),
    itemId: z.string(),
    requiresHumanApproval: z.boolean().default(true),
    reason: z.string()
  })
]);

export const canvasSchema = z.object({
  width: z.literal(1920),
  height: z.literal(1080),
  aspectRatio: z.literal("16:9")
});

export const safeAreaSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});

export const templateKindSchema = z.enum([
  "daily_menu",
  "soup_mains",
  "special",
  "promo",
  "sold_out",
  "info",
  "allergen_legend",
  "brand_intro",
  "soups_duo",
  "mains_grid",
  "pizza_day",
  "hot_buffet"
]);

export const textLayerSchema = z.object({
  id: z.string(),
  role: z.enum(["headline", "subheadline", "item", "price", "note", "legend"]),
  binding: z.string().nullable(),
  text: z.string().nullable().default(null),
  styleId: z.string(),
  maxLines: z.number().int().positive().default(2),
  overflow: z.enum(["split", "truncate", "block"]).default("block")
});

export const templateManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  templateKind: templateKindSchema,
  canvas: canvasSchema,
  safeArea: safeAreaSchema,
  backgroundAssetId: z.string().nullable(),
  durationFrames: z.number().int().positive(),
  transition: z.enum(["cut", "fade"]).default("fade"),
  textLayers: z.array(textLayerSchema),
  validationRules: z.object({
    minContrastRatio: z.number().default(4.5),
    maxItemsPerSlide: z.number().int().positive().default(5),
    requireAllergenLegend: z.boolean().default(true)
  })
});

export const layerFrameSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  zIndex: z.number().int().default(0)
});

export const sectionKeySchema = z.enum(["soups", "mains", "pizza", "buffet", "special"]);

export const layerBindingSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("item"),
    sectionKey: sectionKeySchema,
    index: z.number().int().nonnegative(),
    field: z.enum(["name", "description", "price", "allergens", "photo"])
  }),
  z.object({
    source: z.literal("menu"),
    field: z.enum(["date", "title"])
  }),
  z.object({ source: z.literal("static") })
]);

const layerBaseShape = {
  id: z.string(),
  frame: layerFrameSchema,
  group: z.string().nullable().default(null),
  locked: z.boolean().default(false)
};

export const textLayerV2Schema = z.object({
  ...layerBaseShape,
  type: z.literal("text"),
  role: z.enum(["headline", "subheadline", "item", "price", "note", "legend"]),
  binding: layerBindingSchema.nullable().default(null),
  text: z.string().nullable().default(null),
  color: z.string().default("#191513"),
  align: z.enum(["left", "center", "right"]).default("left"),
  fontSizePx: z.number().int().min(30),
  fontWeight: z.number().int().min(400).max(900).default(700),
  fontStyle: z.enum(["normal", "italic"]).default("normal"),
  lineHeight: z.number().positive().default(1.1),
  maxLines: z.number().int().positive().default(2),
  overflow: z.enum(["truncate", "block"]).default("truncate"),
  uppercase: z.boolean().default(false)
});

export const imageLayerV2Schema = z.object({
  ...layerBaseShape,
  type: z.literal("image"),
  binding: layerBindingSchema.nullable().default(null),
  assetId: z.string().nullable().default(null),
  fit: z.enum(["cover", "contain"]).default("cover"),
  focalPoint: focalPointSchema.default({ x: 0.5, y: 0.5 }),
  cornerRadius: z.number().int().nonnegative().default(0),
  overlay: z.enum(["none", "darken-bottom", "darken-left"]).default("none"),
  placeholder: z.enum(["dish", "none"]).default("dish")
});

export const logoLayerV2Schema = z.object({
  ...layerBaseShape,
  type: z.literal("logo"),
  variant: z.enum(["red", "white"]).default("red")
});

export const shapeLayerV2Schema = z.object({
  ...layerBaseShape,
  type: z.literal("shape"),
  fill: z.string(),
  opacity: z.number().min(0).max(1).default(1),
  cornerRadius: z.number().int().nonnegative().default(0)
});

export const templateLayerV2Schema = z.discriminatedUnion("type", [
  textLayerV2Schema,
  imageLayerV2Schema,
  logoLayerV2Schema,
  shapeLayerV2Schema
]);

export const validationRulesV2Schema = z.object({
  minContrastRatio: z.number().default(4.5),
  maxItemsPerSlide: z.number().int().positive().default(5),
  requireAllergenLegend: z.boolean().default(false),
  minItems: z.number().int().nonnegative().default(0),
  maxItems: z.number().int().positive().default(5),
  requirePhotos: z.enum(["off", "warn"]).default("off"),
  minFontSizePx: z.number().int().positive().default(30)
});

export const templateManifestV2Schema = z.object({
  schemaVersion: z.literal(2),
  id: z.string(),
  name: z.string(),
  templateKind: templateKindSchema,
  canvas: canvasSchema,
  safeArea: safeAreaSchema,
  backgroundColor: z.string().default("#f6f3ee"),
  backgroundGradient: z.string().nullable().default(null),
  backgroundAssetId: z.string().nullable().default(null),
  durationFrames: z.number().int().positive(),
  transition: z.enum(["cut", "fade"]).default("fade"),
  layers: z.array(templateLayerV2Schema),
  validationRules: validationRulesV2Schema
});

export const anyTemplateManifestSchema = z.union([
  templateManifestV2Schema,
  templateManifestSchema
]);

export const slideSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  title: z.string(),
  menuSectionIds: z.array(z.string()).default([]),
  menuItemIds: z.array(z.string()).default([]),
  backgroundAssetId: z.string().nullable().default(null),
  durationFrames: z.number().int().positive(),
  sortOrder: z.number().int()
});

export const deckManifestSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  locationId: z.string(),
  canteenId: z.string(),
  menuVersionId: z.string(),
  status: approvalStatusSchema,
  fps: z.literal(30).default(30),
  canvas: canvasSchema,
  slides: z.array(slideSchema).min(1),
  templateVersionIds: z.array(z.string()),
  templateManifests: z.record(z.string(), anyTemplateManifestSchema).optional(),
  assetIds: z.array(z.string()).default([]),
  assetUrls: z.record(z.string(), z.string().url()).default({}),
  rendererVersion: z.string()
});

export const renderManifestSchema = z.object({
  id: z.string(),
  deck: deckManifestSchema,
  menu: menuExtractionResultSchema.nullable().optional(),
  output: z.object({
    format: z.literal("mp4"),
    codec: z.literal("h264"),
    width: z.literal(1920),
    height: z.literal(1080),
    fps: z.literal(30),
    pixelFormat: z.literal("yuv420p"),
    audio: z.literal("aac_silent_stereo"),
    fastStart: z.boolean().default(true)
  })
});

export const playerManifestSchema = z.object({
  mode: z.literal("video").default("video"),
  screenId: z.string(),
  versionId: z.string(),
  status: z.enum(["published", "fallback"]),
  videoUrl: z.string().url(),
  checksum: z.string(),
  durationSeconds: z.number().positive(),
  publishedAt: z.string(),
  heartbeatIntervalSeconds: z.literal(60)
});

export const livePlayerManifestSchema = z.object({
  mode: z.literal("live"),
  screenId: z.string(),
  versionId: z.string(),
  status: z.enum(["published", "fallback"]),
  deck: deckManifestSchema,
  menu: menuExtractionResultSchema,
  publishedAt: z.string(),
  heartbeatIntervalSeconds: z.literal(60)
});

export const playerPayloadSchema = z.discriminatedUnion("mode", [
  playerManifestSchema,
  livePlayerManifestSchema
]);

// --- Týdenní extrakce jídelního lístku (autopilot M2) ---

export const weekDayOfWeekSchema = z.enum(["PO", "UT", "ST", "CT", "PA"]);

export const weekDaySchema = z.object({
  dayOfWeek: weekDayOfWeekSchema,
  isHoliday: z.boolean().default(false),
  holidayLabel: z.string().nullable().default(null),
  menu: menuExtractionResultSchema.nullable(),
  confidence: z.number().min(0).max(1).default(0),
  warnings: z.array(z.string()).default([])
});

export const weekExtractionResultSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.array(weekDaySchema).length(5)
});

export type WeekDayOfWeek = z.infer<typeof weekDayOfWeekSchema>;
export type WeekDay = z.infer<typeof weekDaySchema>;
export type WeekExtractionResult = z.infer<typeof weekExtractionResultSchema>;

export type OrgRole = z.infer<typeof orgRoleSchema>;
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;
export type RenderJobStatus = z.infer<typeof renderJobStatusSchema>;
export type FocalPoint = z.infer<typeof focalPointSchema>;
export type MenuExtractionItem = z.infer<typeof menuExtractionItemSchema>;
export type MenuExtractionResult = z.infer<typeof menuExtractionResultSchema>;
export type MenuVersionSnapshot = z.infer<typeof menuVersionSnapshotSchema>;
export type AssistantPatchOperation = z.infer<typeof assistantPatchOperationSchema>;
export type TemplateKind = z.infer<typeof templateKindSchema>;
export type TemplateManifest = z.infer<typeof templateManifestSchema>;
export type LayerFrame = z.infer<typeof layerFrameSchema>;
export type SectionKey = z.infer<typeof sectionKeySchema>;
export type LayerBinding = z.infer<typeof layerBindingSchema>;
export type TextLayerV2 = z.infer<typeof textLayerV2Schema>;
export type ImageLayerV2 = z.infer<typeof imageLayerV2Schema>;
export type LogoLayerV2 = z.infer<typeof logoLayerV2Schema>;
export type ShapeLayerV2 = z.infer<typeof shapeLayerV2Schema>;
export type TemplateLayerV2 = z.infer<typeof templateLayerV2Schema>;
export type TemplateManifestV2 = z.infer<typeof templateManifestV2Schema>;
export type AnyTemplateManifest = z.infer<typeof anyTemplateManifestSchema>;
export type Slide = z.infer<typeof slideSchema>;
export type DeckManifest = z.infer<typeof deckManifestSchema>;
export type RenderManifest = z.infer<typeof renderManifestSchema>;
export type PlayerManifest = z.infer<typeof playerManifestSchema>;
export type LivePlayerManifest = z.infer<typeof livePlayerManifestSchema>;
export type PlayerPayload = z.infer<typeof playerPayloadSchema>;
