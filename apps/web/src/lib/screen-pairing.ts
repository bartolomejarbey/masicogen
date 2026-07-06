import { z } from "zod";
import { createPairingCode, hashToken, isUuidLike } from "./security";

export const screenPairingRequestSchema = z.object({
  screenId: z.string().uuid().optional(),
  screenName: z.string().trim().min(1).max(80).default("Nová obrazovka"),
  locationId: z.string().uuid().optional(),
  canteenId: z.string().uuid().optional(),
  expiresInMinutes: z.number().int().min(5).max(7 * 24 * 60).default(15)
});

export type ScreenPairingRequest = z.infer<typeof screenPairingRequestSchema>;

export function validateProductionScreenPairing(input: ScreenPairingRequest) {
  const missing: string[] = [];

  if (!input.locationId) {
    missing.push("locationId");
  }

  if (!input.canteenId) {
    missing.push("canteenId");
  }

  return missing;
}

export function buildScreenPairingPayload(input: {
  requestUrl: string;
  orgId: string;
  screenId: string;
  screenName: string;
  locationId: string;
  canteenId: string;
  rawToken: string;
  expiresInMinutes: number;
  persisted: boolean;
}) {
  const activationUrl = new URL(`/tv/${input.screenId}`, input.requestUrl);
  activationUrl.searchParams.set("token", input.rawToken);

  return {
    persisted: input.persisted,
    screenId: input.screenId,
    orgId: input.orgId,
    screenName: input.screenName,
    locationId: input.locationId,
    canteenId: input.canteenId,
    pairingCode: createPairingCode(),
    deviceToken: input.rawToken,
    activationUrl: activationUrl.toString(),
    tokenPreview: `${input.rawToken.slice(0, 6)}...`,
    tokenHash: hashToken(input.rawToken),
    expiresAt: new Date(Date.now() + input.expiresInMinutes * 60_000).toISOString(),
    expiresInMinutes: input.expiresInMinutes
  };
}

export function getDemoScreenPairingInput(input: Partial<ScreenPairingRequest>) {
  return {
    screenId:
      input.screenId && isUuidLike(input.screenId)
        ? input.screenId
        : "00000000-0000-4000-8000-000000000010",
    screenName: input.screenName?.trim() || "Demo obrazovka",
    locationId:
      input.locationId && isUuidLike(input.locationId)
        ? input.locationId
        : "00000000-0000-4000-8000-000000000002",
    canteenId:
      input.canteenId && isUuidLike(input.canteenId)
        ? input.canteenId
        : "00000000-0000-4000-8000-000000000003",
    expiresInMinutes: input.expiresInMinutes ?? 15
  };
}
