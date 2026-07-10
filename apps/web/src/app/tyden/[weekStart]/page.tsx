import { redirect } from "next/navigation";
import {
  MANUAL_PRESENTATION_EXTRACTION_MODEL,
  czechHolidayName,
  menuExtractionResultSchema
} from "@masico/shared";
import { StudioShell } from "@/components/StudioShell";
import { WeekReview, type WeekReviewDay } from "@/components/WeekReview";
import {
  getStudioAccessState,
  roleCanAccess,
  studioRoleGroups
} from "@/lib/studio-auth";
import { getProductionDashboardSnapshot } from "@/lib/studio-dashboard";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const WEEK_EXTRACTION_MODEL = "openai-vision-week";
const SOURCE_PHOTO_URL_SECONDS = 60 * 60;

type MenuRow = {
  id: string;
  menu_date: string;
  status: string;
};

type MenuVersionRow = {
  id: string;
  menu_id: string;
  status: string;
  snapshot: unknown;
  extraction_model: string | null;
  source_id: string | null;
  created_at: string;
};

type MenuSourceRow = {
  bucket: string;
  object_path: string;
  mime_type: string;
};

export default async function WeekPage({
  params
}: {
  params: Promise<{ weekStart: string }>;
}) {
  const { weekStart } = await params;

  if (!isValidMonday(weekStart)) {
    redirect(`/tyden/${currentPragueMondayIso()}`);
  }

  const access = await getStudioAccessState();
  const dates = Array.from({ length: 5 }, (_, offset) => addDaysIso(weekStart, offset));

  if (access.mode !== "authenticated") {
    return (
      <StudioShell access={access} activeSection="week">
        {access.mode === "demo" ? (
          <WeekReview
            weekStart={weekStart}
            days={dates.map((date) => emptyDay(date))}
            locationId={null}
            canteenId={null}
            canImport={false}
            canApprove={false}
            sourcePhoto={null}
          />
        ) : null}
      </StudioShell>
    );
  }

  const snapshot = await getProductionDashboardSnapshot(access.orgId);
  const canteen = snapshot.canteens[0] ?? null;

  const weekData = canteen
    ? await loadWeekData(access.orgId, canteen.id, dates)
    : { days: dates.map((date) => emptyDay(date)), sourcePhoto: null };

  return (
    <StudioShell access={access} activeSection="week">
      <WeekReview
        weekStart={weekStart}
        days={weekData.days}
        locationId={canteen?.locationId ?? null}
        canteenId={canteen?.id ?? null}
        canImport={roleCanAccess(access.role, studioRoleGroups.menuImporters)}
        canApprove={roleCanAccess(access.role, studioRoleGroups.renderOperators)}
        sourcePhoto={weekData.sourcePhoto}
      />
    </StudioShell>
  );
}

async function loadWeekData(
  orgId: string,
  canteenId: string,
  dates: string[]
): Promise<{ days: WeekReviewDay[]; sourcePhoto: { url: string; isPdf: boolean } | null }> {
  const supabase = await createServerSupabaseClient();

  const { data: menus } = await supabase
    .from("menus")
    .select("id, menu_date, status")
    .eq("org_id", orgId)
    .eq("canteen_id", canteenId)
    .in("menu_date", dates)
    .returns<MenuRow[]>();

  const menuIds = (menus ?? []).map((menu) => menu.id);

  const { data: versions } = menuIds.length
    ? await supabase
        .from("menu_versions")
        .select("id, menu_id, status, snapshot, extraction_model, source_id, created_at")
        .eq("org_id", orgId)
        .in("menu_id", menuIds)
        // Verze ručních prezentací nejsou denní menu — NULL-safe vyloučení.
        .or(`extraction_model.is.null,extraction_model.neq.${MANUAL_PRESENTATION_EXTRACTION_MODEL}`)
        .order("created_at", { ascending: false })
        .returns<MenuVersionRow[]>()
    : { data: [] as MenuVersionRow[] };

  // Verze jsou seřazené sestupně — první nalezená pro menu je ta nejnovější.
  const latestVersionByMenu = new Map<string, MenuVersionRow>();
  for (const version of versions ?? []) {
    if (!latestVersionByMenu.has(version.menu_id)) {
      latestVersionByMenu.set(version.menu_id, version);
    }
  }

  const days = dates.map((date) => {
    const menu = (menus ?? []).find((row) => row.menu_date === date) ?? null;
    const version = menu ? latestVersionByMenu.get(menu.id) ?? null : null;
    const holidayLabel = czechHolidayName(date);

    if (!menu || !version) {
      return emptyDay(date);
    }

    const parsed = menuExtractionResultSchema.safeParse(version.snapshot);
    const sections = parsed.success ? parsed.data.sections : [];
    const itemCount = sections.reduce((total, section) => total + section.items.length, 0);
    const dishPreview = sections
      .flatMap((section) => section.items.map((item) => item.name))
      .slice(0, 3);

    const ready =
      version.status === "approved" ||
      version.status === "published" ||
      menu.status === "approved" ||
      menu.status === "published";

    return {
      date,
      state: ready ? ("ready" as const) : ("review" as const),
      holidayLabel,
      menuVersionId: version.id,
      fromAutopilot: version.extraction_model === WEEK_EXTRACTION_MODEL,
      dishPreview,
      itemCount
    };
  });

  return {
    days,
    sourcePhoto: await loadSourcePhoto(orgId, versions ?? [])
  };
}

/** Zdrojová fotka lístku z posledního týdenního importu — signed URL přes admin. */
async function loadSourcePhoto(
  orgId: string,
  versions: MenuVersionRow[]
): Promise<{ url: string; isPdf: boolean } | null> {
  const latestImport = versions.find(
    (version) => version.extraction_model === WEEK_EXTRACTION_MODEL && version.source_id
  );

  if (!latestImport?.source_id) {
    return null;
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return null;
  }

  const { data: sourceRow } = await admin
    .from("menu_sources")
    .select("bucket, object_path, mime_type")
    .eq("org_id", orgId)
    .eq("id", latestImport.source_id)
    .maybeSingle<MenuSourceRow>();

  if (!sourceRow) {
    return null;
  }

  const { data: signed } = await admin.storage
    .from(sourceRow.bucket)
    .createSignedUrl(sourceRow.object_path, SOURCE_PHOTO_URL_SECONDS);

  if (!signed?.signedUrl) {
    return null;
  }

  return {
    url: signed.signedUrl,
    isPdf: sourceRow.mime_type === "application/pdf"
  };
}

function emptyDay(date: string): WeekReviewDay {
  const holidayLabel = czechHolidayName(date);

  return {
    date,
    state: holidayLabel ? "holiday" : "empty",
    holidayLabel,
    menuVersionId: null,
    fromAutopilot: false,
    dishPreview: [],
    itemCount: 0
  };
}

function isValidMonday(isoDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return false;
  }

  const date = new Date(`${isoDate}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.getUTCDay() === 1;
}

function addDaysIso(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function currentPragueMondayIso() {
  const todayIso = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  const date = new Date(`${todayIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
