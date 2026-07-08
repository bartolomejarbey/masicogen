import { menuExtractionResultSchema, type MenuExtractionResult } from "@masico/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { DayLaunchError, launchDayMenu, type DayLaunchRequest } from "./day-launch";

// approveMenuAndBuildDeck (./autopilot) záměrně necháváme reálný — testujeme
// celou schvalovací cestu včetně auditu. Mockujeme jen jeho I/O závislosti:
// settings (čisté defaulty) a org přepisy šablon (prázdná mapa).
vi.mock("./settings-store", async () => {
  const { resolveSettings } = await import("@masico/shared");
  return {
    loadResolvedSettings: vi.fn(async () => resolveSettings({}))
  };
});

vi.mock("./template-store", () => ({
  loadTemplateOverrides: vi.fn(async () => new Map())
}));

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const LOCATION_ID = "00000000-0000-4000-8000-000000000002";
const CANTEEN_ID = "00000000-0000-4000-8000-000000000003";
const SCREEN_ID = "00000000-0000-4000-8000-000000000004";
const MENU_DATE = "2026-07-08";

type RpcResponse = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

const importRow = {
  org_id: ORG_ID,
  menu_id: "menu-1",
  menu_version_id: "mv-1",
  source_id: "src-1",
  menu_date: MENU_DATE,
  status: "draft"
};

const deckRow = {
  org_id: ORG_ID,
  deck_id: "deck-1",
  deck_version_id: "dv-1",
  menu_version_id: "mv-1",
  status: "draft"
};

const publishRow = {
  screen_id: SCREEN_ID,
  deck_version_id: "dv-1",
  publish_event_id: "pe-1",
  screen_status: "published",
  published_at: "2026-07-08T08:30:00Z"
};

function fakeRpc(overrides: Record<string, RpcResponse> = {}) {
  const responses: Record<string, RpcResponse> = {
    import_text_menu_version: { data: [importRow], error: null },
    approve_menu_version: { data: [{ status: "approved" }], error: null },
    create_tv_deck_from_manifest: { data: [deckRow], error: null },
    approve_deck_version: { data: [{ status: "approved" }], error: null },
    publish_live_deck_to_screen: { data: [publishRow], error: null },
    ...overrides
  };

  const rpc = vi.fn(async (fn: string) => {
    const response = responses[fn];
    if (!response) {
      throw new Error(`Neočekávané RPC volání: ${fn}`);
    }
    return response;
  });

  return { rpc, supabase: { rpc } as unknown as SupabaseClient };
}

function calledRpcNames(rpc: ReturnType<typeof vi.fn>) {
  return rpc.mock.calls.map((call) => call[0]);
}

function menuItem(id: string, name: string, amount: number | null, allergens: string[]) {
  return {
    id,
    name,
    description: null,
    prices: [{ label: "", amount, currency: "CZK" }],
    allergens,
    confidence: 0.95
  };
}

function buildMenu(): MenuExtractionResult {
  return menuExtractionResultSchema.parse({
    restaurant: {},
    date: MENU_DATE,
    sections: [
      {
        id: "soups",
        name: "Polévky",
        items: [menuItem("soup-1", "Gulášová polévka", 49, ["1", "9"])]
      },
      {
        id: "mains",
        name: "Hlavní jídla",
        items: [
          menuItem("main-1", "Smažený řízek s bramborem", 159, ["1", "3", "7"]),
          menuItem("main-2", "Kuřecí steak s rýží", 149, ["1"]),
          menuItem("main-3", "Svíčková na smetaně", 165, ["1", "3", "7", "9"])
        ]
      }
    ]
  });
}

function launchInput(
  overrides: Partial<DayLaunchRequest> = {}
): DayLaunchRequest & { orgId: string } {
  return {
    orgId: ORG_ID,
    locationId: LOCATION_ID,
    canteenId: CANTEEN_ID,
    menuDate: MENU_DATE,
    menu: buildMenu(),
    screenId: SCREEN_ID,
    publish: true,
    ...overrides
  };
}

describe("launchDayMenu — pořadí RPC", () => {
  it("při publish:true projde celou cestu import → approve → deck → publish", async () => {
    const { rpc, supabase } = fakeRpc();

    const result = await launchDayMenu(supabase, launchInput());

    expect(calledRpcNames(rpc)).toEqual([
      "import_text_menu_version",
      "approve_menu_version",
      "create_tv_deck_from_manifest",
      "approve_deck_version",
      "publish_live_deck_to_screen"
    ]);

    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "import_text_menu_version",
      expect.objectContaining({
        target_org_id: ORG_ID,
        target_location_id: LOCATION_ID,
        target_canteen_id: CANTEEN_ID,
        target_menu_date: MENU_DATE
      })
    );
    expect(rpc).toHaveBeenNthCalledWith(
      3,
      "create_tv_deck_from_manifest",
      expect.objectContaining({ target_menu_version_id: "mv-1" })
    );
    expect(rpc).toHaveBeenNthCalledWith(
      5,
      "publish_live_deck_to_screen",
      expect.objectContaining({ target_screen_id: SCREEN_ID, target_deck_version_id: "dv-1" })
    );

    expect(result.menuVersionId).toBe("mv-1");
    expect(result.deckId).toBe("deck-1");
    expect(result.deckVersionId).toBe("dv-1");
    expect(result.itemCount).toBe(4);
    // Menu bez pizzy/bufetu/specialit = intro + polévky + hlavní jídla.
    expect(result.slideCount).toBe(3);
    expect(result.published).toEqual({
      screenId: SCREEN_ID,
      publishEventId: "pe-1",
      publishedAt: "2026-07-08T08:30:00Z"
    });
  });

  it("při publish:false nevolá žádné publish RPC", async () => {
    const { rpc, supabase } = fakeRpc();

    const result = await launchDayMenu(supabase, launchInput({ publish: false }));

    expect(calledRpcNames(rpc)).toEqual([
      "import_text_menu_version",
      "approve_menu_version",
      "create_tv_deck_from_manifest",
      "approve_deck_version"
    ]);
    expect(calledRpcNames(rpc)).not.toContain("publish_live_deck_to_screen");
    expect(result.published).toBeNull();
  });

  it("publish:true bez screenId skončí 422 dřív, než se publikuje", async () => {
    const { rpc, supabase } = fakeRpc();

    const error = await launchDayMenu(supabase, launchInput({ screenId: undefined })).catch(
      (thrown: unknown) => thrown
    );

    expect(error).toBeInstanceOf(DayLaunchError);
    expect((error as DayLaunchError).code).toBe("day_publish_missing_screen");
    expect((error as DayLaunchError).status).toBe(422);
    expect(calledRpcNames(rpc)).not.toContain("publish_live_deck_to_screen");
  });
});

describe("launchDayMenu — blokace nevalidního menu", () => {
  it("menu s chybějící cenou zablokuje launch před prvním RPC", async () => {
    const { rpc, supabase } = fakeRpc();
    const menu = buildMenu();
    menu.sections[1]!.items[0]!.prices = [{ label: "", amount: null, currency: "CZK" }];

    const error = await launchDayMenu(supabase, launchInput({ menu })).catch(
      (thrown: unknown) => thrown
    );

    expect(error).toBeInstanceOf(DayLaunchError);
    const launchError = error as DayLaunchError;
    expect(launchError.code).toBe("day_menu_validation_failed");
    expect(launchError.status).toBe(422);
    expect(launchError.issues?.map((issue) => issue.code)).toContain("missing_price");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("menu s neověřenými alergeny zablokuje launch před prvním RPC", async () => {
    const { rpc, supabase } = fakeRpc();
    const menu = buildMenu();
    menu.sections[0]!.items[0]!.allergens = [];

    const error = await launchDayMenu(supabase, launchInput({ menu })).catch(
      (thrown: unknown) => thrown
    );

    expect(error).toBeInstanceOf(DayLaunchError);
    expect((error as DayLaunchError).status).toBe(422);
    expect((error as DayLaunchError).issues?.map((issue) => issue.code)).toContain(
      "missing_allergens"
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("launchDayMenu — mapování RPC chyb na HTTP status", () => {
  it.each([
    ["28000", 401],
    ["42501", 403],
    ["P0002", 404],
    ["23514", 422]
  ])("PostgreSQL kód %s se přeloží na HTTP %i", async (code, status) => {
    const { rpc, supabase } = fakeRpc({
      import_text_menu_version: { data: null, error: { code, message: "rpc selhalo" } }
    });

    const error = await launchDayMenu(supabase, launchInput()).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(DayLaunchError);
    expect((error as DayLaunchError).code).toBe("day_menu_import_failed");
    expect((error as DayLaunchError).status).toBe(status);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("chyba uvnitř autopilota (approve_menu_version) si drží status i kód", async () => {
    const { supabase } = fakeRpc({
      approve_menu_version: { data: null, error: { code: "42501", message: "forbidden" } }
    });

    const error = await launchDayMenu(supabase, launchInput()).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(DayLaunchError);
    expect((error as DayLaunchError).code).toBe("autopilot_menu_approval_failed");
    expect((error as DayLaunchError).status).toBe(403);
  });

  it("selhání publikace se mapuje na day_publish_failed se statusem dle kódu", async () => {
    const { supabase } = fakeRpc({
      publish_live_deck_to_screen: {
        data: null,
        error: { code: "P0002", message: "screen not found" }
      }
    });

    const error = await launchDayMenu(supabase, launchInput()).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(DayLaunchError);
    expect((error as DayLaunchError).code).toBe("day_publish_failed");
    expect((error as DayLaunchError).status).toBe(404);
  });

  it("neznámý kód RPC chyby spadne na HTTP 500", async () => {
    const { supabase } = fakeRpc({
      import_text_menu_version: { data: null, error: { code: "XX000", message: "boom" } }
    });

    const error = await launchDayMenu(supabase, launchInput()).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(DayLaunchError);
    expect((error as DayLaunchError).status).toBe(500);
  });
});
