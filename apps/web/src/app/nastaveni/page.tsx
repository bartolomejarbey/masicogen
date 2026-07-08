import { resolveSettings } from "@masico/shared";
import { SettingsForm, type AutomationRunItem } from "@/components/SettingsForm";
import { StudioShell } from "@/components/StudioShell";
import { loadResolvedSettings } from "@/lib/settings-store";
import { getStudioAccessState } from "@/lib/studio-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AutomationRunRow = {
  run_type: string;
  status: string;
  error_message: string | null;
  started_at: string;
  detail: Record<string, unknown> | null;
};

export default async function SettingsPage() {
  const access = await getStudioAccessState();

  // Zamčené studio: StudioShell vykreslí vysvětlující kartu místo obsahu.
  if (access.mode === "locked") {
    return (
      <StudioShell access={access} activeSection="settings">
        {null}
      </StudioShell>
    );
  }

  if (access.mode === "demo") {
    return (
      <StudioShell access={access} activeSection="settings">
        <SettingsHeader />
        <SettingsForm
          initialSettings={resolveSettings({})}
          isAdmin={false}
          readOnlyNote="Demo režim: ukázka výchozího nastavení. Změny se v demu neukládají."
          runs={[]}
          showAdminSections
        />
      </StudioShell>
    );
  }

  const isAdmin = access.role === "owner" || access.role === "admin";
  const settings = await loadResolvedSettings(access.orgId);
  const runs = isAdmin ? await loadAutomationRuns(access.orgId) : [];

  return (
    <StudioShell access={access} activeSection="settings">
      <SettingsHeader />
      <SettingsForm
        initialSettings={settings}
        isAdmin={isAdmin}
        readOnlyNote={
          isAdmin
            ? null
            : "Nastavení může měnit vlastník nebo admin. Tady vidíte, jak dlouho se jednotlivé obrazovky točí."
        }
        runs={runs}
        showAdminSections={isAdmin}
      />
    </StudioShell>
  );
}

function SettingsHeader() {
  return (
    <div className="topbar">
      <div>
        <p className="eyebrow">Nastavení</p>
        <h1 className="page-title">Nastavení televize</h1>
        <p className="page-copy">
          Jak se denní menu na televizi točí, co se předvyplňuje a co smí systém dělat sám.
        </p>
      </div>
    </div>
  );
}

async function loadAutomationRuns(orgId: string): Promise<AutomationRunItem[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("automation_runs")
    .select("run_type, status, error_message, started_at, detail")
    .eq("org_id", orgId)
    .order("started_at", { ascending: false })
    .limit(10)
    .returns<AutomationRunRow[]>();

  return (data ?? []).map((row) => ({
    runType: row.run_type,
    status: row.status,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    detail: row.detail
  }));
}
