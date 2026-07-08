import { requireStudioApiAccess } from "@/lib/studio-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SuggestRow = {
  display_name: string;
  price_czk: number | null;
  allergen_codes: string[];
  photo_asset_id: string | null;
  photo_focal_point: { x: number; y: number } | null;
  times_used: number;
  last_menu_date: string;
};

export async function GET(request: Request) {
  const access = await requireStudioApiAccess();
  if (access instanceof Response) {
    return access;
  }

  const url = new URL(request.url);
  const canteenId = url.searchParams.get("canteenId");
  const query = url.searchParams.get("q")?.trim() ?? "";
  const sectionId = url.searchParams.get("sectionId");

  if (!canteenId) {
    return Response.json(
      { error: "Chybí jídelna pro našeptávač.", code: "suggest_missing_canteen" },
      { status: 400 }
    );
  }

  if (access.mode !== "authenticated" || query.length < 2) {
    return Response.json({ suggestions: [] });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("suggest_dishes", {
    target_org_id: access.orgId,
    target_canteen_id: canteenId,
    search_text: query,
    target_section_id: sectionId,
    result_limit: 8
  });

  if (error) {
    return Response.json(
      { error: `Našeptávač selhal: ${error.message}`, code: "suggest_failed" },
      { status: 500 }
    );
  }

  const suggestions = ((data as SuggestRow[] | null) ?? []).map((row) => ({
    name: row.display_name,
    priceCzk: row.price_czk,
    allergens: row.allergen_codes,
    photoAssetId: row.photo_asset_id,
    photoFocalPoint: row.photo_focal_point,
    timesUsed: row.times_used,
    lastMenuDate: row.last_menu_date
  }));

  return Response.json({ suggestions });
}
