import { redirect } from "next/navigation";
import {
  MANUAL_PRESENTATION_EXTRACTION_MODEL,
  menuExtractionResultSchema,
  type MenuExtractionResult
} from "@masico/shared";
import { DayMenuComposer } from "@/components/DayMenuComposer";
import { StudioShell } from "@/components/StudioShell";
import {
  getStudioAccessState,
  roleCanAccess,
  studioRoleGroups,
  type StudioAccessRole
} from "@/lib/studio-auth";
import {
  getProductionDashboardSnapshot,
  type ProductionDashboardSnapshot
} from "@/lib/studio-dashboard";
import { loadResolvedSettings } from "@/lib/settings-store";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const roleLabels: Record<StudioAccessRole, string> = {
  owner: "vlastník",
  admin: "admin",
  editor: "editor",
  designer: "designér",
  approver: "schvalovatel",
  publisher: "obsluha TV",
  viewer: "náhled"
};

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T12:00:00`).getTime())) {
    redirect(`/den/${pragueTodayIso()}`);
  }

  const access = await getStudioAccessState();

  if (access.mode !== "authenticated") {
    return (
      <StudioShell access={access} activeSection="today">
        {access.mode === "demo" ? (
          <DayMenuComposer
            date={date}
            canLaunch={false}
            roleLabel="ukázka"
            snapshot={demoSnapshot(date)}
            initialMenu={null}
            initialStatus={null}
          />
        ) : null}
      </StudioShell>
    );
  }

  const snapshot = await getProductionDashboardSnapshot(access.orgId);
  const defaultCanteenId = snapshot.canteens[0]?.id ?? null;
  const [prefill, settings] = await Promise.all([
    defaultCanteenId
      ? loadDayMenu(access.orgId, defaultCanteenId, date)
      : Promise.resolve({ menu: null, status: null }),
    loadResolvedSettings(access.orgId)
  ]);

  return (
    <StudioShell access={access} activeSection="today">
      <DayMenuComposer
        date={date}
        canLaunch={roleCanAccess(access.role, studioRoleGroups.renderOperators)}
        roleLabel={roleLabels[access.role]}
        snapshot={snapshot}
        initialMenu={prefill.menu}
        initialStatus={prefill.status}
        settings={{
          durationsSeconds: settings.loop.durationsSeconds,
          enabledSlides: settings.loop.enabledSlides,
          footerLegendText: settings.content.footerLegendText
        }}
      />
    </StudioShell>
  );
}

async function loadDayMenu(
  orgId: string,
  canteenId: string,
  date: string
): Promise<{ menu: MenuExtractionResult | null; status: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data: menuRow } = await supabase
    .from("menus")
    .select("id, status")
    .eq("org_id", orgId)
    .eq("canteen_id", canteenId)
    .eq("menu_date", date)
    .maybeSingle<{ id: string; status: string }>();

  if (!menuRow) {
    return { menu: null, status: null };
  }

  const { data: versionRow } = await supabase
    .from("menu_versions")
    .select("snapshot")
    .eq("org_id", orgId)
    .eq("menu_id", menuRow.id)
    // Verze ručních prezentací nejsou denní menu — NULL-safe vyloučení.
    .or(`extraction_model.is.null,extraction_model.neq.${MANUAL_PRESENTATION_EXTRACTION_MODEL}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ snapshot: unknown }>();

  const parsed = versionRow ? menuExtractionResultSchema.safeParse(versionRow.snapshot) : null;

  return {
    menu: parsed?.success ? parsed.data : null,
    status: menuRow.status
  };
}

function demoSnapshot(date: string): ProductionDashboardSnapshot {
  const demoOrgId = "00000000-0000-4000-8000-000000000001";
  const demoLocationId = "00000000-0000-4000-8000-000000000002";
  const demoCanteenId = "00000000-0000-4000-8000-000000000003";

  return {
    orgId: demoOrgId,
    orgName: "MASI-CO (ukázka)",
    todayIso: date,
    locations: [
      {
        id: demoLocationId,
        name: "Jídelna MASI-CO",
        screenCount: 1,
        onlineScreenCount: 0,
        confirmedScreenCount: 0,
        latestMenuDate: null,
        latestMenuStatus: null,
        blockingStatus: "needs_menu"
      }
    ],
    canteens: [{ id: demoCanteenId, locationId: demoLocationId, name: "Jídelna" }],
    screens: [],
    upcomingMenus: [],
    autopilot: { lastMorningCheck: null, pendingReviewDates: [] },
    counts: {
      locations: 1,
      screens: 0,
      onlineScreens: 0,
      menusToday: 0,
      exports: 0,
      renderJobsRunning: 0
    },
    dataError: null
  };
}

function pragueTodayIso() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}
