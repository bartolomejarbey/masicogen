import { getRenderJob, renderJobsConfigured } from "@/lib/render-jobs";
import {
  isLocalDev,
  isUuidLike,
  requireConfiguredIntegration
} from "@/lib/security";
import { requireStudioApiAccess, studioRoleGroups } from "@/lib/studio-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireStudioApiAccess(studioRoleGroups.all);
  if (access instanceof Response) {
    return access;
  }

  const { id } = await params;
  if (!isLocalDev() && !isUuidLike(id)) {
    return Response.json({ error: "Neplatné ID render jobu." }, { status: 400 });
  }

  if (access.mode === "authenticated" && renderJobsConfigured()) {
    const job = await getRenderJob(id, access.orgId);
    if (!job) {
      return Response.json({ error: "Render job nebyl nalezen." }, { status: 404 });
    }

    return Response.json(job);
  }

  const integrationUnavailable = requireConfiguredIntegration("Stav render jobu");
  if (integrationUnavailable) {
    return integrationUnavailable;
  }

  return Response.json({
    id,
    status: "queued",
    progress: 0,
    attempts: 0,
    message: "Demo status. Worker bude po napojení zapisovat skutečný průběh."
  });
}
