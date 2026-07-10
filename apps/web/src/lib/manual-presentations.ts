import "server-only";

import {
  MANUAL_PRESENTATION_EDITOR_SOURCE,
  MANUAL_PRESENTATION_SCHEMA_VERSION,
  buildManualPresentationRenderModel,
  manualPresentationDocumentSchema,
  type ManualPresentationDocument
} from "@masico/shared";
import { createServerSupabaseClient } from "./supabase/server";

export type SavedManualPresentation = {
  deckId: string;
  deckVersionId: string;
  menuVersionId: string;
  name: string;
  document: ManualPresentationDocument;
  createdAt: string;
  updatedAt: string;
};

export type PresentationLocation = {
  id: string;
  name: string;
};

export type PresentationCanteen = {
  id: string;
  locationId: string;
  name: string;
};

type DeckRow = {
  id: string;
  name: string;
  created_at: string;
};

type DeckVersionRow = {
  id: string;
  deck_id: string;
  menu_version_id: string;
  manifest_json: unknown;
  created_at: string;
};

type ImportedMenuRow = {
  menu_version_id: string;
};

type SavedDeckRow = {
  deck_id: string;
  deck_version_id: string;
  menu_version_id: string;
  created_at: string;
};

export class ManualPresentationStoreError extends Error {
  code: string;
  status: number;
  issues?: Array<{ path: string; message: string }>;

  constructor(
    code: string,
    message: string,
    status: number,
    issues?: Array<{ path: string; message: string }>
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.issues = issues;
  }
}

export async function listManualPresentations(orgId: string): Promise<SavedManualPresentation[]> {
  const supabase = await createServerSupabaseClient();
  const [deckResult, versionResult] = await Promise.all([
    supabase
      .from("slide_decks")
      .select("id, name, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .returns<DeckRow[]>(),
    supabase
      .from("deck_versions")
      .select("id, deck_id, menu_version_id, manifest_json, created_at")
      .eq("org_id", orgId)
      .eq("manifest_json->>editorSource", MANUAL_PRESENTATION_EDITOR_SOURCE)
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<DeckVersionRow[]>()
  ]);

  if (deckResult.error) {
    throw new ManualPresentationStoreError(
      "presentation_list_failed",
      `Načtení prezentací selhalo: ${deckResult.error.message}`,
      500
    );
  }
  if (versionResult.error) {
    throw new ManualPresentationStoreError(
      "presentation_versions_failed",
      `Načtení verzí prezentací selhalo: ${versionResult.error.message}`,
      500
    );
  }

  const decks = new Map((deckResult.data ?? []).map((deck) => [deck.id, deck]));
  const latestByDeck = new Map<string, DeckVersionRow>();
  for (const version of versionResult.data ?? []) {
    if (!latestByDeck.has(version.deck_id)) {
      latestByDeck.set(version.deck_id, version);
    }
  }

  const presentations: SavedManualPresentation[] = [];
  for (const [deckId, version] of latestByDeck) {
    const deck = decks.get(deckId);
    const manifest = asRecord(version.manifest_json);
    if (
      !deck ||
      manifest?.editorSource !== MANUAL_PRESENTATION_EDITOR_SOURCE ||
      manifest.editorArchived === true
    ) {
      continue;
    }

    const document = manualPresentationDocumentSchema.safeParse(manifest.editorDocument);
    if (!document.success) {
      continue;
    }

    presentations.push({
      deckId,
      deckVersionId: version.id,
      menuVersionId: version.menu_version_id,
      name: document.data.name || deck.name,
      document: document.data,
      createdAt: deck.created_at,
      updatedAt: version.created_at
    });
  }

  return presentations.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function loadPresentationContexts(orgId: string): Promise<{
  locations: PresentationLocation[];
  canteens: PresentationCanteen[];
}> {
  const supabase = await createServerSupabaseClient();
  const [locationResult, canteenResult] = await Promise.all([
    supabase
      .from("locations")
      .select("id, name")
      .eq("org_id", orgId)
      .order("name")
      .returns<Array<{ id: string; name: string }>>(),
    supabase
      .from("canteens")
      .select("id, location_id, name")
      .eq("org_id", orgId)
      .order("name")
      .returns<Array<{ id: string; location_id: string; name: string }>>()
  ]);

  const error = locationResult.error ?? canteenResult.error;
  if (error) {
    throw new ManualPresentationStoreError(
      "presentation_context_failed",
      `Načtení provozoven selhalo: ${error.message}`,
      500
    );
  }

  return {
    locations: locationResult.data ?? [],
    canteens: (canteenResult.data ?? []).map((canteen) => ({
      id: canteen.id,
      locationId: canteen.location_id,
      name: canteen.name
    }))
  };
}

export async function saveManualPresentation(input: {
  orgId: string;
  document: unknown;
  deckId?: string | null;
  expectedDeckVersionId?: string | null;
}): Promise<SavedManualPresentation> {
  const parsed = manualPresentationDocumentSchema.safeParse(input.document);
  if (!parsed.success) {
    throw new ManualPresentationStoreError(
      "presentation_invalid",
      "Prezentace obsahuje neplatná nebo neúplná data.",
      400,
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    );
  }
  const document = parsed.data;
  const renderModel = buildManualPresentationRenderModel(document, { orgId: input.orgId });
  const supabase = await createServerSupabaseClient();

  // Záměrně NE import_text_menu_version: ten upsertuje skutečné denní menu
  // (reset statusu, přepis current_version_id). Ruční prezentace mají vlastní
  // RPC, které menus řádek nemění a verzi značí extraction_model
  // 'manual-presentation', aby ji denní tok ignoroval.
  const imported = await supabase.rpc("import_manual_presentation_menu_version", {
    target_org_id: input.orgId,
    target_location_id: document.locationId,
    target_canteen_id: document.canteenId,
    target_menu_date: document.presentationDate,
    extraction_snapshot: renderModel.menu
  });

  if (imported.error) {
    throw rpcStoreError(
      imported.error,
      "presentation_menu_import_failed",
      "Uložení položek prezentace selhalo"
    );
  }

  const menuVersionId = (imported.data as ImportedMenuRow[] | null)?.[0]?.menu_version_id;
  if (!menuVersionId) {
    throw new ManualPresentationStoreError(
      "presentation_menu_import_missing",
      "Uložení položek nevrátilo verzi menu.",
      500
    );
  }

  const manifest = {
    ...renderModel.deck,
    menuVersionId,
    assetUrls: {},
    editorSource: MANUAL_PRESENTATION_EDITOR_SOURCE,
    editorSchemaVersion: MANUAL_PRESENTATION_SCHEMA_VERSION,
    editorArchived: false,
    editorDocument: document
  };

  const saved = await supabase.rpc("save_manual_presentation_version", {
    target_deck_id: input.deckId ?? null,
    expected_deck_version_id: input.expectedDeckVersionId ?? null,
    target_menu_version_id: menuVersionId,
    presentation_name: document.name,
    deck_manifest: manifest
  });

  if (saved.error) {
    throw rpcStoreError(
      saved.error,
      "presentation_save_failed",
      "Dlouhodobé uložení prezentace selhalo"
    );
  }

  const row = (saved.data as SavedDeckRow[] | null)?.[0];
  if (!row) {
    throw new ManualPresentationStoreError(
      "presentation_save_missing",
      "Uložení nevrátilo novou verzi prezentace.",
      500
    );
  }

  return {
    deckId: row.deck_id,
    deckVersionId: row.deck_version_id,
    menuVersionId: row.menu_version_id,
    name: document.name,
    document,
    createdAt: row.created_at,
    updatedAt: row.created_at
  };
}

export async function archiveManualPresentation(input: {
  deckId: string;
  expectedDeckVersionId: string;
}) {
  const supabase = await createServerSupabaseClient();
  const archived = await supabase.rpc("archive_manual_presentation", {
    target_deck_id: input.deckId,
    expected_deck_version_id: input.expectedDeckVersionId
  });

  if (archived.error) {
    throw rpcStoreError(
      archived.error,
      "presentation_archive_failed",
      "Archivace prezentace selhala"
    );
  }
}

function rpcStoreError(
  error: { code?: string; message: string },
  fallbackCode: string,
  prefix: string
) {
  const status = rpcStatus(error.code);
  const conflict = error.message.includes("Manual presentation version conflict");
  return new ManualPresentationStoreError(
    conflict ? "presentation_conflict" : fallbackCode,
    conflict
      ? "Prezentaci mezitím uložil někdo jiný. Načtěte ji znovu a změny zopakujte."
      : `${prefix}: ${error.message}`,
    conflict ? 409 : status
  );
}

function rpcStatus(code: string | undefined) {
  if (code === "28000") return 401;
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "55000") return 409;
  if (code === "23514" || code === "22023" || code === "23502") return 422;
  return 500;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
