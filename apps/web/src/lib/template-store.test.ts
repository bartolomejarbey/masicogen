import { dailyLoopTemplates, defaultTemplateManifests } from "@masico/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServerSupabaseClient } from "./supabase/server";
import { loadTemplateOverrides } from "./template-store";

vi.mock("./supabase/server", () => ({
  createServerSupabaseClient: vi.fn()
}));

const mockedCreateClient = vi.mocked(createServerSupabaseClient);

type TableRows = Record<string, unknown[]>;

/**
 * Minimální fake nad supabase-js query builderem: každá metoda vrací builder,
 * await builderu vrátí { data } podle názvu tabulky.
 */
function fakeSupabase(tables: TableRows) {
  const from = vi.fn((table: string) => {
    const rows = tables[table] ?? [];
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "returns"]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.then = (
      onFulfilled: (value: { data: unknown[]; error: null }) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
    return builder;
  });

  mockedCreateClient.mockResolvedValue({ from } as never);
  return { from };
}

const ORG_ID = "00000000-0000-4000-8000-000000000001";

const v2Manifest = structuredClone(
  dailyLoopTemplates.find((template) => template.id === "mains-grid")!
);
// Manifest bez schemaVersion: 2 — starší formát z dob před vizuálním editorem.
const v1Manifest = structuredClone(
  defaultTemplateManifests.find((template) => template.id === "daily-menu")!
);

describe("loadTemplateOverrides", () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
  });

  it("vrací jen v2 manifesty; v1 a nevalidní JSON tiše přeskočí", async () => {
    fakeSupabase({
      templates: [
        { id: "tpl-legacy", slug: "daily-menu", current_version_id: "ver-legacy" },
        { id: "tpl-v2", slug: "mains-grid", current_version_id: "ver-v2" },
        { id: "tpl-broken", slug: "broken", current_version_id: "ver-broken" },
        { id: "tpl-draftless", slug: "draftless", current_version_id: null }
      ],
      template_versions: [
        { id: "ver-legacy", template_id: "tpl-legacy", version: 3, manifest_json: v1Manifest },
        { id: "ver-v2", template_id: "tpl-v2", version: 5, manifest_json: v2Manifest },
        { id: "ver-broken", template_id: "tpl-broken", version: 1, manifest_json: { nope: true } }
      ]
    });

    const overrides = await loadTemplateOverrides(ORG_ID);

    expect([...overrides.keys()]).toEqual(["mains-grid"]);

    const override = overrides.get("mains-grid");
    expect(override?.version).toBe(5);
    expect(override?.manifest.schemaVersion).toBe(2);
    expect(override?.manifest.id).toBe("mains-grid");
  });

  it("bez uložených verzí vrací prázdnou mapu a na template_versions se neptá", async () => {
    const { from } = fakeSupabase({
      templates: [{ id: "tpl-1", slug: "soups-duo", current_version_id: null }]
    });

    const overrides = await loadTemplateOverrides(ORG_ID);

    expect(overrides.size).toBe(0);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("templates");
  });

  it("org bez šablon vrací prázdnou mapu", async () => {
    fakeSupabase({});

    const overrides = await loadTemplateOverrides(ORG_ID);
    expect(overrides.size).toBe(0);
  });
});
