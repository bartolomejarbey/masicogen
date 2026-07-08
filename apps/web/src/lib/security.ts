import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function isLocalDev() {
  return process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_APP_ENV !== "production";
}

export function demoDataEnabled() {
  return (
    isLocalDev() ||
    (process.env.ENABLE_DEMO_DATA === "true" && process.env.NEXT_PUBLIC_APP_ENV !== "production")
  );
}

export function requireConfiguredIntegration(feature: string) {
  if (demoDataEnabled()) {
    return null;
  }

  return Response.json(
    {
      error: `${feature} zatím není napojené na produkční Supabase/worker integraci.`,
      code: "integration_required"
    },
    { status: 501 }
  );
}

export function requireInternalAccess(request: Request) {
  if (isLocalDev()) {
    return null;
  }

  const expected = process.env.APP_INTERNAL_API_TOKEN;
  if (!expected) {
    return Response.json({ error: "Internal API token is not configured." }, { status: 503 });
  }

  const token = readBearerToken(request);
  if (!token || !safeEqual(token, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export async function requireScreenAccess(request: Request, screenId?: string) {
  if (isLocalDev()) {
    return null;
  }

  if (screenId && !isUuidLike(screenId)) {
    return Response.json(
      { error: "screenId musí být v produkci UUID.", code: "invalid_screen_id" },
      { status: 400 }
    );
  }

  if (!playerTokenHashingConfigured()) {
    return Response.json(
      { error: "PLAYER_TOKEN_PEPPER is not configured.", code: "player_token_pepper_missing" },
      { status: 503 }
    );
  }

  const token = readBearerToken(request);
  if (!token) {
    return Response.json({ error: "Missing screen token" }, { status: 401 });
  }

  if (screenId && (await verifyScreenToken(screenId, token))) {
    return null;
  }

  const legacyToken = process.env.PLAYER_DEVICE_TOKEN;
  if (process.env.ALLOW_LEGACY_PLAYER_TOKEN === "true" && legacyToken && safeEqual(token, legacyToken)) {
    return Response.json(
      { error: "Legacy player token is disabled outside local development." },
      { status: 401 }
    );
  }

  if (!screenTokenStoreConfigured()) {
    return Response.json({ error: "Screen token store is not configured." }, { status: 503 });
  }

  return Response.json({ error: "Unauthorized screen token" }, { status: 401 });
}

export function verifyWorkerSignature(request: Request, rawBody: string) {
  const secret = process.env.WORKER_SHARED_SECRET;
  if (!secret) {
    return false;
  }

  const timestamp = request.headers.get("x-worker-timestamp");
  const signature = request.headers.get("x-worker-signature");

  if (!timestamp || !signature) {
    return isLocalDev() && request.headers.get("x-worker-secret") === secret;
  }

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60_000) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex")}`;

  return safeEqual(signature, expected);
}

export function createPairingCode() {
  return randomBytes(3).toString("hex").toUpperCase();
}

export function hashToken(token: string) {
  const pepper = process.env.PLAYER_TOKEN_PEPPER;
  if (!pepper && !isLocalDev()) {
    throw new Error("PLAYER_TOKEN_PEPPER is required for production player token hashing.");
  }

  return createHash("sha256")
    .update(`${pepper ?? ""}:${token}`)
    .digest("hex");
}

export function playerTokenHashingConfigured() {
  return isLocalDev() || Boolean(process.env.PLAYER_TOKEN_PEPPER);
}

export function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function readBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length);
}

export function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function screenTokenStoreConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function verifyScreenToken(screenId: string, token: string) {
  if (!screenTokenStoreConfigured()) {
    return false;
  }

  const url = new URL(
    `/rest/v1/screen_tokens`,
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  url.searchParams.set("select", "screen_id,expires_at,revoked_at,token_hash");
  url.searchParams.set("screen_id", `eq.${screenId}`);
  url.searchParams.set("token_hash", `eq.${hashToken(token)}`);
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
      "content-type": "application/json"
    },
    cache: "no-store"
  }).catch(() => null);

  if (!response?.ok) {
    return false;
  }

  const rows = (await response.json().catch(() => [])) as Array<{
    expires_at: string | null;
    revoked_at: string | null;
  }>;
  const row = rows[0];
  if (!row || row.revoked_at) {
    return false;
  }

  return !row.expires_at || new Date(row.expires_at).getTime() > Date.now();
}
