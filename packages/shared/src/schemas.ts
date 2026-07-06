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
  templateKind: z.enum([
    "daily_menu",
    "soup_mains",
    "special",
    "promo",
    "sold_out",
    "info",
    "allergen_legend"
  ]),
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
  assetIds: z.array(z.string()).default([]),
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
  screenId: z.string(),
  versionId: z.string(),
  status: z.enum(["published", "fallback"]),
  videoUrl: z.string().url(),
  checksum: z.string(),
  durationSeconds: z.number().positive(),
  publishedAt: z.string(),
  heartbeatIntervalSeconds: z.literal(60)
});

export type OrgRole = z.infer<typeof orgRoleSchema>;
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;
export type RenderJobStatus = z.infer<typeof renderJobStatusSchema>;
export type MenuExtractionResult = z.infer<typeof menuExtractionResultSchema>;
export type MenuVersionSnapshot = z.infer<typeof menuVersionSnapshotSchema>;
export type AssistantPatchOperation = z.infer<typeof assistantPatchOperationSchema>;
export type TemplateManifest = z.infer<typeof templateManifestSchema>;
export type Slide = z.infer<typeof slideSchema>;
export type DeckManifest = z.infer<typeof deckManifestSchema>;
export type RenderManifest = z.infer<typeof renderManifestSchema>;
export type PlayerManifest = z.infer<typeof playerManifestSchema>;
