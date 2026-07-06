import { isLocalDev, requireConfiguredIntegration } from "@/lib/security";

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected && !isLocalDev()) {
    return Response.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }

  if (expected && request.headers.get("authorization") !== `Bearer ${expected}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const integrationUnavailable = requireConfiguredIntegration("Retenční cleanup");
  if (integrationUnavailable) {
    return integrationUnavailable;
  }

  return Response.json({
    ok: true,
    cleaned: {
      renderArtifacts: 0,
      failedJobs: 0,
      expiredSignedUrls: 0
    },
    note: "Cron placeholder pro retenční cleanup."
  });
}
