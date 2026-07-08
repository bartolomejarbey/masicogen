import { menuExtractionResultSchema } from "@masico/shared";
import { requireStudioApiAccess } from "@/lib/studio-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type MenuRow = {
  id: string;
  status: string;
  current_version_id: string | null;
};

type VersionRow = {
  id: string;
  status: string;
  snapshot: unknown;
  created_at: string;
};

export async function GET(request: Request) {
  const access = await requireStudioApiAccess();
  if (access instanceof Response) {
    return access;
  }

  const url = new URL(request.url);
  const canteenId = url.searchParams.get("canteenId");
  const date = url.searchParams.get("date");

  if (!canteenId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json(
      { error: "Chybí jídelna nebo datum.", code: "day_menu_invalid_query" },
      { status: 400 }
    );
  }

  if (access.mode !== "authenticated") {
    return Response.json({ menu: null, status: null });
  }

  const supabase = await createServerSupabaseClient();
  const { data: menuRow, error: menuError } = await supabase
    .from("menus")
    .select("id, status, current_version_id")
    .eq("org_id", access.orgId)
    .eq("canteen_id", canteenId)
    .eq("menu_date", date)
    .maybeSingle<MenuRow>();

  if (menuError) {
    return Response.json(
      { error: `Načtení menu selhalo: ${menuError.message}`, code: "day_menu_load_failed" },
      { status: 500 }
    );
  }

  if (!menuRow) {
    return Response.json({ menu: null, status: null });
  }

  const { data: versionRow, error: versionError } = await supabase
    .from("menu_versions")
    .select("id, status, snapshot, created_at")
    .eq("org_id", access.orgId)
    .eq("menu_id", menuRow.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<VersionRow>();

  if (versionError) {
    return Response.json(
      { error: `Načtení verze menu selhalo: ${versionError.message}`, code: "day_menu_version_failed" },
      { status: 500 }
    );
  }

  if (!versionRow) {
    return Response.json({ menu: null, status: menuRow.status });
  }

  const parsedSnapshot = menuExtractionResultSchema.safeParse(versionRow.snapshot);

  return Response.json({
    menu: parsedSnapshot.success ? parsedSnapshot.data : null,
    status: menuRow.status,
    menuVersionId: versionRow.id
  });
}
