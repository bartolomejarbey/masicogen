import { dailyLoopTemplates } from "@masico/shared";
import { Palette, Pencil } from "lucide-react";
import Link from "next/link";
import { StudioShell } from "@/components/StudioShell";
import { getStudioAccessState, roleCanAccess } from "@/lib/studio-auth";
import { loadTemplateOverrides } from "@/lib/template-store";

export const dynamic = "force-dynamic";

const editorRoles = ["owner", "admin", "designer"] as const;

export default async function TemplatesPage() {
  const access = await getStudioAccessState();
  const canEdit =
    access.mode === "demo" ||
    (access.mode === "authenticated" && roleCanAccess(access.role, editorRoles));

  const overrides =
    access.mode === "authenticated" ? await loadTemplateOverrides(access.orgId) : new Map();

  return (
    <StudioShell access={access} activeSection="templates">
      <div className="topbar">
        <div>
          <p className="eyebrow">Šablony</p>
          <h1 className="page-title">Šablony denní smyčky</h1>
          <p className="page-copy">
            Šest slidů, které se každý den plní jídly z formuláře. Vzhled se upravuje tady —
            denní provoz ho nemění.
          </p>
        </div>
      </div>

      {!canEdit ? (
        <div className="production-banner" role="status">
          <Palette size={20} aria-hidden="true" />
          <strong>Jen k nahlédnutí.</strong>
          <span>Úpravy šablon může dělat vlastník, admin nebo designér.</span>
        </div>
      ) : null}

      <div className="grid cols-3">
        {dailyLoopTemplates.map((template) => {
          const override = overrides.get(template.id);

          return (
            <article className="card pad template-card" key={template.id}>
              <h2 className="card-title">{template.name}</h2>
              <p className="muted">
                {Math.round(template.durationFrames / 30)} s ·{" "}
                {override
                  ? `upravená verze ${override.version}`
                  : "výchozí vzhled MASI-CO"}
              </p>
              {canEdit ? (
                <Link className="button primary" href={`/sablony/${template.id}/editor`}>
                  <Pencil size={18} aria-hidden="true" />
                  Upravit šablonu
                </Link>
              ) : null}
            </article>
          );
        })}
      </div>
    </StudioShell>
  );
}
