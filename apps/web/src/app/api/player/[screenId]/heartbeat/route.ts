import { playerDataConfigured, recordPlayerHeartbeat } from "@/lib/player-data";
import { requireConfiguredIntegration, requireScreenAccess } from "@/lib/security";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ screenId: string }> }
) {
  const { screenId } = await params;
  const unauthorized = await requireScreenAccess(request, screenId);
  if (unauthorized) {
    return unauthorized;
  }

  const body = (await request.json().catch(() => ({}))) as {
    versionId?: string | null;
    error?: string | null;
    userAgent?: string;
  };

  if (playerDataConfigured()) {
    await recordPlayerHeartbeat({
      screenId,
      versionId: body.versionId ?? null,
      error: body.error ?? null
    });

    return Response.json({
      ok: true,
      screenId,
      versionId: body.versionId ?? null,
      error: body.error ?? null,
      persisted: true,
      receivedAt: new Date().toISOString()
    });
  }

  const integrationUnavailable = requireConfiguredIntegration("Heartbeat obrazovky");
  if (integrationUnavailable) {
    return integrationUnavailable;
  }

  return Response.json({
    ok: true,
    screenId,
    versionId: body.versionId ?? null,
    error: body.error ?? null,
    persisted: false,
    receivedAt: new Date().toISOString()
  });
}
