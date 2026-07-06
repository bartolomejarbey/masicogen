import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requireStudioApiAccess,
  roleCanAccess,
  studioAuthConfigured,
  studioAuthRequired,
  studioRoleGroups
} from "./studio-auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("studio auth guard", () => {
  it("requires studio auth for production-like runtimes", () => {
    expect(studioAuthRequired({ NEXT_PUBLIC_APP_ENV: "production" })).toBe(true);
    expect(studioAuthRequired({ NODE_ENV: "production", NEXT_PUBLIC_APP_ENV: "preview" })).toBe(true);
    expect(studioAuthRequired({ NODE_ENV: "development", NEXT_PUBLIC_APP_ENV: "preview" })).toBe(false);
    expect(studioAuthRequired({})).toBe(false);
  });

  it("treats Supabase URL and anon key as the public auth configuration", () => {
    expect(
      studioAuthConfigured({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon"
      })
    ).toBe(true);
    expect(studioAuthConfigured({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" })).toBe(false);
    expect(studioAuthConfigured({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" })).toBe(false);
  });

  it("maps roles to explicit studio API permissions", () => {
    expect(roleCanAccess("editor", studioRoleGroups.contentEditors)).toBe(true);
    expect(roleCanAccess("viewer", studioRoleGroups.contentEditors)).toBe(false);
    expect(roleCanAccess("publisher", studioRoleGroups.renderOperators)).toBe(true);
    expect(roleCanAccess("approver", studioRoleGroups.screenManagers)).toBe(false);
  });

  it("allows local demo API access without a secret bearer token", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "");

    const access = await requireStudioApiAccess(studioRoleGroups.contentEditors);

    expect(access).not.toBeInstanceOf(Response);
    if (access instanceof Response) {
      throw new Error("Expected demo studio access");
    }
    expect(access.mode).toBe("demo");
    expect(access.role).toBe("owner");
    expect(access.orgId).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("fails closed for production studio APIs when Supabase Auth env is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const response = await requireStudioApiAccess(studioRoleGroups.contentEditors);

    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) {
      throw new Error("Expected locked studio response");
    }
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "studio_auth_not_configured"
    });
  });
});
