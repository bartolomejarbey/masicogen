import { describe, expect, it, vi } from "vitest";
import {
  buildScreenPairingPayload,
  getDemoScreenPairingInput,
  screenPairingRequestSchema,
  validateProductionScreenPairing
} from "./screen-pairing";

describe("screen pairing helpers", () => {
  it("requires location and canteen for production pairing", () => {
    const input = screenPairingRequestSchema.parse({
      screenName: "TV výdejna"
    });

    expect(validateProductionScreenPairing(input)).toEqual(["locationId", "canteenId"]);
  });

  it("builds a one-time activation URL without exposing it in the path", () => {
    vi.stubEnv("PLAYER_TOKEN_PEPPER", "pepper");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T12:00:00.000Z"));

    const payload = buildScreenPairingPayload({
      requestUrl: "https://studio.masi-co-food.cz/api/screens/pair",
      orgId: "00000000-0000-4000-8000-000000000001",
      screenId: "00000000-0000-4000-8000-000000000010",
      screenName: "TV výdejna",
      locationId: "00000000-0000-4000-8000-000000000002",
      canteenId: "00000000-0000-4000-8000-000000000003",
      rawToken: "raw-device-token",
      expiresInMinutes: 15,
      persisted: true
    });

    expect(payload.activationUrl).toBe(
      "https://studio.masi-co-food.cz/tv/00000000-0000-4000-8000-000000000010?token=raw-device-token"
    );
    expect(payload.tokenPreview).toBe("raw-de...");
    expect(payload.expiresAt).toBe("2026-07-06T12:15:00.000Z");
    expect(payload.tokenHash).toHaveLength(64);

    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("uses stable local demo UUIDs when no production target is provided", () => {
    expect(getDemoScreenPairingInput({ screenName: "  " })).toMatchObject({
      screenId: "00000000-0000-4000-8000-000000000010",
      screenName: "Demo obrazovka",
      locationId: "00000000-0000-4000-8000-000000000002",
      canteenId: "00000000-0000-4000-8000-000000000003",
      expiresInMinutes: 15
    });
  });
});
