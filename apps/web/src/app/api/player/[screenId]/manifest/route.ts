import { demoPlayerManifest } from "@masico/shared";
import { getPublishedPlayerManifest, playerDataConfigured } from "@/lib/player-data";
import { requireConfiguredIntegration, requireScreenAccess } from "@/lib/security";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ screenId: string }> }
) {
  const { screenId } = await params;
  const unauthorized = await requireScreenAccess(request, screenId);
  if (unauthorized) {
    return unauthorized;
  }

  if (playerDataConfigured()) {
    const manifest = await getPublishedPlayerManifest(screenId);
    if (!manifest) {
      return Response.json({ error: "Obrazovka nemá publikovaný export." }, { status: 404 });
    }

    return Response.json(manifest, {
      headers: {
        "cache-control": "no-store"
      }
    });
  }

  const integrationUnavailable = requireConfiguredIntegration("TV manifest");
  if (integrationUnavailable) {
    return integrationUnavailable;
  }

  return Response.json(
    createLocalDemoManifest(request, screenId),
    {
      headers: {
        "cache-control": "no-store"
      }
    }
  );
}

function createLocalDemoManifest(request: Request, screenId: string) {
  const videoUrl = new URL("/api/exports/export-demo/download?inline=1", request.url);

  return {
    ...demoPlayerManifest,
    screenId,
    videoUrl: videoUrl.toString(),
    checksum: "demo-smoke-render-v1"
  };
}
