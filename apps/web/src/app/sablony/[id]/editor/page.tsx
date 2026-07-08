import { getDailyLoopTemplate } from "@masico/shared";
import { redirect } from "next/navigation";
import { StudioShell } from "@/components/StudioShell";
import { TemplateEditor } from "@/components/TemplateEditor";
import { getStudioAccessState, roleCanAccess } from "@/lib/studio-auth";
import { loadTemplateOverrides } from "@/lib/template-store";

export const dynamic = "force-dynamic";

const editorRoles = ["owner", "admin", "designer"] as const;

export default async function TemplateEditorPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const fallback = getDailyLoopTemplate(id);

  if (!fallback) {
    redirect("/sablony");
  }

  const access = await getStudioAccessState();

  if (access.mode === "authenticated" && !roleCanAccess(access.role, editorRoles)) {
    redirect("/sablony");
  }

  const overrides =
    access.mode === "authenticated" ? await loadTemplateOverrides(access.orgId) : new Map();
  const override = overrides.get(id);

  return (
    <StudioShell access={access} activeSection="templates">
      <TemplateEditor
        slug={id}
        initialManifest={override?.manifest ?? fallback}
        baseVersion={override?.version ?? null}
        canEditLayout
      />
    </StudioShell>
  );
}
