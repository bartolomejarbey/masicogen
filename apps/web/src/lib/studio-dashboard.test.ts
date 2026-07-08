import { describe, expect, it, vi } from "vitest";
import { summarizeProductionDashboard } from "./studio-dashboard";

describe("production studio dashboard summary", () => {
  it("summarizes locations without using demo fallback data", () => {
    vi.setSystemTime(new Date("2026-07-06T10:00:00.000Z"));

    const snapshot = summarizeProductionDashboard({
      orgId: "org-1",
      orgName: "MASI-CO",
      todayIso: "2026-07-06",
      locations: [
        { id: "loc-1", name: "Jídelna" },
        { id: "loc-2", name: "Výdejna" }
      ],
      canteens: [{ id: "canteen-1", location_id: "loc-1", name: "Hlavní jídelna" }],
      screens: [
        {
          id: "screen-1",
          location_id: "loc-1",
          canteen_id: "canteen-1",
          name: "TV hlavní",
          status: "paired",
          current_deck_version_id: "deck-1",
          last_heartbeat_at: "2026-07-06T09:59:20.000Z",
          last_seen_deck_version_id: "deck-1",
          last_seen_at: "2026-07-06T09:59:20.000Z"
        },
        {
          id: "screen-2",
          location_id: "loc-1",
          canteen_id: "canteen-1",
          name: "TV záloha",
          status: "paired",
          current_deck_version_id: null,
          last_heartbeat_at: null,
          last_seen_deck_version_id: null,
          last_seen_at: null
        }
      ],
      menus: [
        {
          id: "menu-1",
          location_id: "loc-1",
          canteen_id: "canteen-1",
          menu_date: "2026-07-06",
          status: "approved",
          current_version_id: "menu-version-1"
        }
      ],
      exportCount: 1,
      runningRenderJobCount: 2,
      dataError: null
    });

    expect(snapshot.counts).toMatchObject({
      locations: 2,
      screens: 2,
      onlineScreens: 1,
      menusToday: 1,
      exports: 1,
      renderJobsRunning: 2
    });
    expect(snapshot.locations[0]).toMatchObject({
      name: "Jídelna",
      screenCount: 2,
      onlineScreenCount: 1,
      confirmedScreenCount: 1,
      blockingStatus: "verify_tv"
    });
    expect(snapshot.locations[1]).toMatchObject({
      name: "Výdejna",
      screenCount: 0,
      blockingStatus: "empty"
    });
    expect(snapshot.canteens).toEqual([
      { id: "canteen-1", locationId: "loc-1", name: "Hlavní jídelna" }
    ]);
    expect(snapshot.screens).toEqual([
      {
        id: "screen-1",
        locationId: "loc-1",
        canteenId: "canteen-1",
        name: "TV hlavní",
        status: "paired",
        currentDeckVersionId: "deck-1"
      },
      {
        id: "screen-2",
        locationId: "loc-1",
        canteenId: "canteen-1",
        name: "TV záloha",
        status: "paired",
        currentDeckVersionId: null
      }
    ]);

    vi.useRealTimers();
  });

  it("marks a published screen as awaiting TV confirmation until heartbeat sees the current deck", () => {
    vi.setSystemTime(new Date("2026-07-06T10:00:00.000Z"));

    const snapshot = summarizeProductionDashboard({
      orgId: "org-1",
      orgName: "MASI-CO",
      todayIso: "2026-07-06",
      locations: [{ id: "loc-1", name: "Jídelna" }],
      canteens: [{ id: "canteen-1", location_id: "loc-1", name: "Hlavní jídelna" }],
      screens: [
        {
          id: "screen-1",
          location_id: "loc-1",
          canteen_id: "canteen-1",
          name: "TV hlavní",
          status: "published",
          current_deck_version_id: "deck-2",
          last_heartbeat_at: "2026-07-06T09:59:40.000Z",
          last_seen_deck_version_id: "deck-1",
          last_seen_at: "2026-07-06T09:58:40.000Z"
        }
      ],
      menus: [
        {
          id: "menu-1",
          location_id: "loc-1",
          canteen_id: "canteen-1",
          menu_date: "2026-07-06",
          status: "approved",
          current_version_id: "menu-version-1"
        }
      ],
      exportCount: 1,
      runningRenderJobCount: 0,
      dataError: null
    });

    expect(snapshot.locations[0]).toMatchObject({
      confirmedScreenCount: 0,
      blockingStatus: "awaiting_tv_confirmation"
    });

    vi.useRealTimers();
  });
});
