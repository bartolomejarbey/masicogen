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

    const response = await requireScreenAccess(
      new Request("https://tv.test/api/player/screen/manifest"),
      "screen"
    );

    expect(response?.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("fails closed when screen token storage is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("ALLOW_LEGACY_PLAYER_TOKEN", "false");

    const response = await requireScreenAccess(
      new Request("https://tv.test/api/player/screen/manifest", {
        headers: { authorization: "Bearer device-token" }
      }),
      "screen"
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

    const response = await requireScreenAccess(
      new Request("https://tv.test/api/player/screen/manifest", {
        headers: { authorization: "Bearer legacy-token" }
      }),
      "screen"
    );

    expect(response?.status).toBe(401);
    vi.unstubAllEnvs();
  });
});
