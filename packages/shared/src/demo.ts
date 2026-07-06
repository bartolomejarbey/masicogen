import type {
  DeckManifest,
  MenuExtractionResult,
  MenuVersionSnapshot,
  PlayerManifest
} from "./schemas";

const demoOrgId = "00000000-0000-4000-8000-000000000001";
const demoLocationId = "00000000-0000-4000-8000-000000000002";
const demoCanteenId = "00000000-0000-4000-8000-000000000003";

export const demoMenu: MenuExtractionResult = {
  restaurant: {
    name: "MASI-CO food",
    locale: "cs-CZ",
    currency: "CZK"
  },
  date: "2026-07-06",
  locationName: "Jídelna MASI-CO",
  warnings: ["Ukázková data pro lokální vývoj."],
  sections: [
    {
      id: "soups",
      name: "Polévky",
      items: [
        {
          id: "gulasova-polevka",
          name: "Gulášová polévka",
          shortName: "Gulášová",
          description: "poctivý hovězí základ",
          prices: [{ label: "porce", amount: 49, currency: "CZK" }],
          allergens: ["1", "9"],
          allergensUnknown: false,
          dietaryTags: [],
          modifiers: [],
          available: true,
          highlight: false,
          sourceRefs: [],
          confidence: 0.93
        }
      ]
    },
    {
      id: "mains",
      name: "Hlavní jídla",
      items: [
        {
          id: "rizek-bramborovy-salat",
          name: "Smažený vepřový řízek, bramborový salát",
          shortName: "Vepřový řízek",
          description: "domácí bramborový salát",
          prices: [{ label: "porce", amount: 159, currency: "CZK" }],
          allergens: ["1", "3", "7", "10"],
          allergensUnknown: false,
          dietaryTags: [],
          modifiers: [],
          available: true,
          highlight: true,
          sourceRefs: [],
          confidence: 0.96
        },
        {
          id: "hoveci-gulas-knedlik",
          name: "Hovězí guláš, houskový knedlík",
          shortName: "Hovězí guláš",
          description: null,
          prices: [{ label: "porce", amount: 149, currency: "CZK" }],
          allergens: ["1", "3", "7"],
          allergensUnknown: false,
          dietaryTags: [],
          modifiers: [],
          available: true,
          highlight: false,
          sourceRefs: [],
          confidence: 0.91
        }
      ]
    }
  ]
};

export const demoMenuVersion: MenuVersionSnapshot = {
  id: "menu-version-demo",
  orgId: demoOrgId,
  locationId: demoLocationId,
  canteenId: demoCanteenId,
  sourceId: "source-demo",
  date: "2026-07-06",
  status: "needs_review",
  extracted: demoMenu,
  approvedBy: null,
  approvedAt: null,
  createdAt: "2026-07-06T08:00:00.000Z"
};

export const demoDeck: DeckManifest = {
  id: "deck-demo",
  orgId: demoOrgId,
  locationId: demoLocationId,
  canteenId: demoCanteenId,
  menuVersionId: demoMenuVersion.id,
  status: "needs_review",
  fps: 30,
  canvas: {
    width: 1920,
    height: 1080,
    aspectRatio: "16:9"
  },
  slides: [
    {
      id: "slide-daily",
      templateId: "daily-menu",
      title: "Dnešní menu",
      menuSectionIds: ["soups", "mains"],
      menuItemIds: ["gulasova-polevka", "rizek-bramborovy-salat", "hoveci-gulas-knedlik"],
      backgroundAssetId: null,
      durationFrames: 270,
      sortOrder: 1
    },
    {
      id: "slide-special",
      templateId: "special-offer",
      title: "Special menu",
      menuSectionIds: ["mains"],
      menuItemIds: ["rizek-bramborovy-salat"],
      backgroundAssetId: null,
      durationFrames: 240,
      sortOrder: 2
    },
    {
      id: "slide-allergens",
      templateId: "allergen-legend",
      title: "Alergenová legenda",
      menuSectionIds: [],
      menuItemIds: [],
      backgroundAssetId: null,
      durationFrames: 300,
      sortOrder: 3
    }
  ],
  templateVersionIds: [
    "daily-menu@1",
    "special-offer@1",
    "allergen-legend@1"
  ],
  assetIds: [],
  assetUrls: {},
  rendererVersion: "0.1.0"
};

export const demoPlayerManifest: PlayerManifest = {
  mode: "video",
  screenId: "screen-demo",
  versionId: "deck-demo",
  status: "published",
  videoUrl: "https://example.com/masico-demo-loop.mp4",
  checksum: "demo-checksum",
  durationSeconds: 27,
  publishedAt: "2026-07-06T08:15:00.000Z",
  heartbeatIntervalSeconds: 60
};
