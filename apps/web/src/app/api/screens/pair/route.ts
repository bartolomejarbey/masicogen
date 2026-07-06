import { randomBytes } from "node:crypto";
import {
  createPairingCode,
  hashToken,
  requireConfiguredIntegration
} from "@/lib/security";
import { requireStudioApiAccess, studioRoleGroups } from "@/lib/studio-auth";

export async function POST(request: Request) {
  const access = await requireStudioApiAccess(studioRoleGroups.screenManagers);
  if (access instanceof Response) {
    return access;
  }

  const integrationUnavailable = requireConfiguredIntegration("Párování obrazovky");
  if (integrationUnavailable) {
    return integrationUnavailable;
  }

  const body = (await request.json().catch(() => ({}))) as {
    screenId?: string;
    screenName?: string;
    canteenId?: string;
  };

  const rawToken = randomBytes(24).toString("base64url");
  const screenId = body.screenId ?? "screen-demo";
  const activationUrl = new URL(`/tv/${screenId}`, request.url);
  activationUrl.searchParams.set("token", rawToken);

  return Response.json({
    screenId,
    orgId: access.orgId,
    screenName: body.screenName ?? "Nová obrazovka",
    canteenId: body.canteenId ?? "canteen-main",
    pairingCode: createPairingCode(),
    deviceToken: rawToken,
    activationUrl: activationUrl.toString(),
    tokenPreview: `${rawToken.slice(0, 6)}...`,
    tokenHash: hashToken(rawToken),
    expiresInMinutes: 15,
    note: "Raw token se v produkci zobrazí jen jednou a DB uloží pouze hash."
  });
}
