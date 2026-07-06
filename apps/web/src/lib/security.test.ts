import { describe, expect, it, vi } from "vitest";
import { requireConfiguredIntegration, requireInternalAccess, requireScreenAccess } from "./security";

describe("API security guards", () => {
  it("fails closed in production without an internal API token", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("APP_INTERNAL_API_TOKEN", "");

    const response = requireInternalAccess(new Request("https://studio.test/api/chat"));

    expect(response?.status).toBe(503);
    vi.unstubAllEnvs();
  });

  it("requires a matching bearer token in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("APP_INTERNAL_API_TOKEN", "secret");

    const response = requireInternalAccess(
      new Request("https://studio.test/api/chat", {
        headers: { authorization: "Bearer wrong" }
      })
    );

    expect(response?.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("blocks demo-only integrations in production unless explicitly enabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("ENABLE_DEMO_DATA", "false");

    const response = requireConfiguredIntegration("TV manifest");

    expect(response?.status).toBe(501);
    vi.unstubAllEnvs();
  });

  it("does not allow demo data in the production app environment", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("ENABLE_DEMO_DATA", "true");

    const response = requireConfiguredIntegration("TV manifest");

    expect(response?.status).toBe(501);
    vi.unstubAllEnvs();
  });

  it("requires a bearer token for screen APIs in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("PLAYER_TOKEN_PEPPER", "pepper");

    const response = await requireScreenAccess(
      new Request("https://tv.test/api/player/00000000-0000-4000-8000-000000000010/manifest"),
      "00000000-0000-4000-8000-000000000010"
    );

    expect(response?.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("rejects non-UUID screen ids in production before token lookup", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("PLAYER_TOKEN_PEPPER", "pepper");

    const response = await requireScreenAccess(
      new Request("https://tv.test/api/player/screen-demo/manifest", {
        headers: { authorization: "Bearer device-token" }
      }),
      "screen-demo"
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toMatchObject({
      code: "invalid_screen_id"
    });
    vi.unstubAllEnvs();
  });

  it("requires a player token pepper in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("PLAYER_TOKEN_PEPPER", "");

    const response = await requireScreenAccess(
      new Request("https://tv.test/api/player/00000000-0000-4000-8000-000000000010/manifest", {
        headers: { authorization: "Bearer device-token" }
      }),
      "00000000-0000-4000-8000-000000000010"
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      code: "player_token_pepper_missing"
    });
    vi.unstubAllEnvs();
  });

  it("fails closed when screen token storage is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("ALLOW_LEGACY_PLAYER_TOKEN", "false");
    vi.stubEnv("PLAYER_TOKEN_PEPPER", "pepper");

    const response = await requireScreenAccess(
      new Request("https://tv.test/api/player/00000000-0000-4000-8000-000000000010/manifest", {
        headers: { authorization: "Bearer device-token" }
      }),
      "00000000-0000-4000-8000-000000000010"
    );

    expect(response?.status).toBe(503);
    vi.unstubAllEnvs();
  });

  it("does not allow the legacy player token in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("ALLOW_LEGACY_PLAYER_TOKEN", "true");
    vi.stubEnv("PLAYER_DEVICE_TOKEN", "legacy-token");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("PLAYER_TOKEN_PEPPER", "pepper");

    const response = await requireScreenAccess(
      new Request("https://tv.test/api/player/00000000-0000-4000-8000-000000000010/manifest", {
        headers: { authorization: "Bearer legacy-token" }
      }),
      "00000000-0000-4000-8000-000000000010"
    );

    expect(response?.status).toBe(401);
    vi.unstubAllEnvs();
  });
});
