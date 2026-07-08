import { createServerSupabaseClient } from "./supabase/server";

export type ProductionLocationStatus = {
  id: string;
  name: string;
  screenCount: number;
  onlineScreenCount: number;
  confirmedScreenCount: number;
  latestMenuDate: string | null;
  latestMenuStatus: string | null;
  blockingStatus:
    | "empty"
    | "needs_menu"
    | "needs_publish"
    | "needs_tv_online"
    | "awaiting_tv_confirmation"
    | "needs_export"
    | "verify_tv";
};

export type ProductionDashboardSnapshot = {
  orgId: string;
  orgName: string;
  todayIso: string;
  locations: ProductionLocationStatus[];
  canteens: ProductionCanteen[];
  screens: ProductionScreen[];
  upcomingMenus: UpcomingMenu[];
  counts: {
    locations: number;
    screens: number;
    onlineScreens: number;
    menusToday: number;
    exports: number;
    renderJobsRunning: number;
  };
  dataError: string | null;
};

export type ProductionCanteen = {
  id: string;
  locationId: string;
  name: string;
};

export type ProductionScreen = {
  id: string;
  locationId: string;
  canteenId: string;
  name: string;
  status: string;
  currentDeckVersionId: string | null;
};

type OrganizationRow = {
  name: string;
};

export type LocationRow = {
  id: string;
  name: string;
};

export type ScreenRow = {
  id: string;
  location_id: string;
  canteen_id: string;
  name: string;
  status: string;
  current_deck_version_id: string | null;
  last_heartbeat_at: string | null;
  last_seen_deck_version_id: string | null;
  last_seen_at: string | null;
};

export type MenuRow = {
  id: string;
  location_id: string;
  canteen_id: string;
  menu_date: string;
  status: string;
  current_version_id: string | null;
};

export type UpcomingMenu = {
  canteenId: string;
  locationId: string;
  date: string;
  status: string;
};

type CanteenRow = {
  id: string;
  location_id: string;
  name: string;
};

type ExportRow = {
  id: string;
};

type RenderJobRow = {
  id: string;
  status: string;
};

type StudioSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export async function getProductionDashboardSnapshot(
  orgId: string
): Promise<ProductionDashboardSnapshot> {
  const todayIso = getPragueTodayIso();
  const supabase = await createServerSupabaseClient();

  const [
    orgResult,
    locationsResult,
    canteensResult,
    screensResult,
    menusResult,
    exportsResult,
    renderJobsResult
  ] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("name")
        .eq("id", orgId)
        .maybeSingle<OrganizationRow>(),
      supabase
        .from("locations")
        .select("id, name")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true })
        .returns<LocationRow[]>(),
      supabase
        .from("canteens")
        .select("id, location_id, name")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true })
        .returns<CanteenRow[]>(),
      getDashboardScreens(supabase, orgId),
      supabase
        .from("menus")
        .select("id, location_id, canteen_id, menu_date, status, current_version_id")
        .eq("org_id", orgId)
        .gte("menu_date", todayIso)
        .order("menu_date", { ascending: false })
        .returns<MenuRow[]>(),
      supabase
        .from("exports")
        .select("id")
        .eq("org_id", orgId)
        .eq("format", "mp4")
        .returns<ExportRow[]>(),
      supabase
        .from("render_jobs")
        .select("id, status")
        .eq("org_id", orgId)
        .in("status", ["queued", "leased", "running", "retrying"])
        .returns<RenderJobRow[]>()
    ]);

  const dataError = [
    orgResult.error ? `organizations: ${orgResult.error.message}` : null,
    locationsResult.error ? `locations: ${locationsResult.error.message}` : null,
    canteensResult.error ? `canteens: ${canteensResult.error.message}` : null,
    screensResult.error ? `screens: ${screensResult.error.message}` : null,
    menusResult.error ? `menus: ${menusResult.error.message}` : null,
    exportsResult.error ? `exports: ${exportsResult.error.message}` : null,
    renderJobsResult.error ? `render_jobs: ${renderJobsResult.error.message}` : null
  ]
    .filter(Boolean)
    .join(" | ");

  return summarizeProductionDashboard({
    orgId,
    orgName: orgResult.data?.name ?? "MASI-CO",
    todayIso,
    locations: locationsResult.data ?? [],
    canteens: canteensResult.data ?? [],
    screens: screensResult.data ?? [],
    menus: menusResult.data ?? [],
    exportCount: exportsResult.data?.length ?? 0,
    runningRenderJobCount: renderJobsResult.data?.length ?? 0,
    dataError: dataError || null
  });
}

export function summarizeProductionDashboard(input: {
  orgId: string;
  orgName: string;
  todayIso: string;
  locations: LocationRow[];
  canteens: CanteenRow[];
  screens: ScreenRow[];
  menus: MenuRow[];
  exportCount: number;
  runningRenderJobCount: number;
  dataError: string | null;
}): ProductionDashboardSnapshot {
  const locationStatuses = input.locations.map((location) => {
    const screens = input.screens.filter((screen) => screen.location_id === location.id);
    const menus = input.menus.filter((menu) => menu.location_id === location.id);
    const latestMenu = menus[0] ?? null;
    const onlineScreenCount = screens.filter((screen) => isScreenOnline(screen)).length;
    const publishedScreenCount = screens.filter((screen) => screen.current_deck_version_id).length;
    const confirmedScreenCount = screens.filter((screen) => hasSeenCurrentDeck(screen)).length;
    const hasTodayMenu = menus.some((menu) => menu.menu_date === input.todayIso);

    return {
      id: location.id,
      name: location.name,
      screenCount: screens.length,
      onlineScreenCount,
      confirmedScreenCount,
      latestMenuDate: latestMenu?.menu_date ?? null,
      latestMenuStatus: latestMenu?.status ?? null,
      blockingStatus: getLocationBlockingStatus({
        screenCount: screens.length,
        onlineScreenCount,
        publishedScreenCount,
        confirmedScreenCount,
        hasTodayMenu,
        exportCount: input.exportCount
      })
    };
  });

  return {
    orgId: input.orgId,
    orgName: input.orgName,
    todayIso: input.todayIso,
    locations: locationStatuses,
    canteens: input.canteens.map((canteen) => ({
      id: canteen.id,
      locationId: canteen.location_id,
      name: canteen.name
    })),
    screens: input.screens.map((screen) => ({
      id: screen.id,
      locationId: screen.location_id,
      canteenId: screen.canteen_id,
      name: screen.name,
      status: screen.status,
      currentDeckVersionId: screen.current_deck_version_id
    })),
    upcomingMenus: input.menus.map((menu) => ({
      canteenId: menu.canteen_id,
      locationId: menu.location_id,
      date: menu.menu_date,
      status: menu.status
    })),
    counts: {
      locations: input.locations.length,
      screens: input.screens.length,
      onlineScreens: input.screens.filter((screen) => isScreenOnline(screen)).length,
      menusToday: input.menus.filter((menu) => menu.menu_date === input.todayIso).length,
      exports: input.exportCount,
      renderJobsRunning: input.runningRenderJobCount
    },
    dataError: input.dataError
  };
}

function getLocationBlockingStatus(input: {
  screenCount: number;
  onlineScreenCount: number;
  publishedScreenCount: number;
  confirmedScreenCount: number;
  hasTodayMenu: boolean;
  exportCount: number;
}): ProductionLocationStatus["blockingStatus"] {
  if (input.screenCount === 0) {
    return "empty";
  }

  if (!input.hasTodayMenu) {
    return "needs_menu";
  }

  if (input.publishedScreenCount === 0) {
    return "needs_publish";
  }

  if (input.onlineScreenCount === 0) {
    return "needs_tv_online";
  }

  if (input.confirmedScreenCount < input.publishedScreenCount) {
    return "awaiting_tv_confirmation";
  }

  if (input.exportCount === 0) {
    return "needs_export";
  }

  return "verify_tv";
}

async function getDashboardScreens(supabase: StudioSupabaseClient, orgId: string) {
  const extendedResult = await supabase
    .from("screens")
    .select(
      "id, location_id, canteen_id, name, status, current_deck_version_id, last_heartbeat_at, last_seen_deck_version_id, last_seen_at"
    )
    .eq("org_id", orgId)
    .returns<ScreenRow[]>();

  if (!isMissingColumnError(extendedResult.error)) {
    return extendedResult;
  }

  const fallbackResult = await supabase
    .from("screens")
    .select("id, location_id, canteen_id, name, status, current_deck_version_id, last_heartbeat_at")
    .eq("org_id", orgId)
    .returns<Array<Omit<ScreenRow, "last_seen_deck_version_id" | "last_seen_at">>>();

  return {
    ...fallbackResult,
    data:
      fallbackResult.data?.map((screen) => ({
        ...screen,
        last_seen_deck_version_id: null,
        last_seen_at: null
      })) ?? null
  };
}

function isScreenOnline(screen: ScreenRow) {
  if (!screen.last_heartbeat_at) {
    return false;
  }

  const heartbeatAgeMs = Date.now() - new Date(screen.last_heartbeat_at).getTime();
  return Number.isFinite(heartbeatAgeMs) && heartbeatAgeMs <= 90_000;
}

function hasSeenCurrentDeck(screen: ScreenRow) {
  return Boolean(
    screen.current_deck_version_id &&
      screen.last_seen_deck_version_id === screen.current_deck_version_id &&
      screen.last_seen_at
  );
}

function getPragueTodayIso() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function isMissingColumnError(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "42703" ||
        error.message?.includes("last_seen_deck_version_id") ||
        error.message?.includes("last_seen_at"))
  );
}
