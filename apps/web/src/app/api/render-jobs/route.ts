import { randomUUID } from "node:crypto";
import { renderJobStatusSchema } from "@masico/shared";
import { queueNames } from "@/lib/env";
import { createRenderJob, renderJobsConfigured } from "@/lib/render-jobs";
import {
  isLocalDev,
  isUuidLike,
  requireConfiguredIntegration
} from "@/lib/security";
import { requireStudioApiAccess, studioRoleGroups } from "@/lib/studio-auth";

export async function POST(request: Request) {
  const access = await requireStudioApiAccess(studioRoleGroups.renderOperators);
  if (access instanceof Response) {
    return access;
  }

  const body = (await request.json().catch(() => ({}))) as {
    orgId?: string;
    deckVersionId?: string;
    jobType?: "render-preview" | "render-final";
  };

  if (!body.deckVersionId) {
    return Response.json({ error: "Chybí deckVersionId." }, { status: 400 });
  }

  if (!isLocalDev() && !isUuidLike(body.deckVersionId)) {
    return Response.json({ error: "deckVersionId musí být UUID." }, { status: 400 });
  }

  const jobType = body.jobType ?? "render-final";
  const orgId = access.orgId;

  if (!isUuidLike(orgId)) {
    return Response.json({ error: "orgId musí být UUID." }, { status: 400 });
  }

  if (access.mode === "authenticated" && renderJobsConfigured()) {
    const job = await createRenderJob({
      orgId,
      deckVersionId: body.deckVersionId,
      jobType
    });

    return Response.json(job, { status: 202 });
  }

  const integrationUnavailable = requireConfiguredIntegration("Vytvoření render jobu");
  if (integrationUnavailable) {
    return integrationUnavailable;
  }

  const job = {
    id: randomUUID(),
    deckVersionId: body.deckVersionId,
    status: renderJobStatusSchema.parse("queued"),
    queue: jobType === "render-preview" ? queueNames.renderPreview : queueNames.renderFinal,
    attempts: 0,
    progress: 0,
    createdAt: new Date().toISOString()
  };

  return Response.json(job, { status: 202 });
}
