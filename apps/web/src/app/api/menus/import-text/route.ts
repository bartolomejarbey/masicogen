import { buildTextMenuImportPayload, textMenuImportRequestSchema } from "@/lib/menu-import";
import { requireStudioApiAccess, studioRoleGroups } from "@/lib/studio-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ImportTextMenuRpcRow = {
  org_id: string;
  menu_id: string;
  menu_version_id: string;
  source_id: string;
  menu_date: string;
  status: string;
};

export async function POST(request: Request) {
  const access = await requireStudioApiAccess(studioRoleGroups.menuImporters);
  if (access instanceof Response) {
    return access;
  }

  const parsedBody = textMenuImportRequestSchema.safeParse(
    await request.json().catch(() => ({}))
  );

  if (!parsedBody.success) {
    return Response.json(
      {
        error: "Import menu nemá platná vstupní data.",
        code: "invalid_menu_import_input",
        issues: parsedBody.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      },
      { status: 400 }
    );
  }

  const payload = buildTextMenuImportPayload(parsedBody.data);

  if (payload.itemCount === 0) {
    return Response.json(
      {
        error: "V textu nebyla rozpoznaná žádná položka menu.",
        code: "empty_menu_import",
        menu: payload.menu,
        warnings: payload.menu.warnings
      },
      { status: 422 }
    );
  }

  if (access.mode === "demo") {
    return Response.json({
      persisted: false,
      mode: "demo",
      menu: payload.menu,
      itemCount: payload.itemCount,
      warningCount: payload.warningCount,
      issues: payload.issues,
      note: "Lokální demo import nic neukládá. Produkce volá import_text_menu_version přes Supabase Auth."
    });
  }

  const supabase = await createServerSupabaseClient();
  const { data: rawData, error } = await supabase.rpc("import_text_menu_version", {
    target_org_id: access.orgId,
    target_location_id: parsedBody.data.locationId,
    target_canteen_id: parsedBody.data.canteenId,
    target_menu_date: parsedBody.data.menuDate,
    source_text: parsedBody.data.sourceText,
    extraction_snapshot: payload.menu
  });

  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "22023" || error.code === "23502" ? 400 : 500;
    return Response.json(
      {
        error: `Import menu se nepodařilo uložit: ${error.message}`,
        code: "menu_import_rpc_failed"
      },
      { status }
    );
  }

  const data = rawData as ImportTextMenuRpcRow[] | null;
  const result = data?.[0];
  if (result && result.org_id !== access.orgId) {
    return Response.json(
      {
        error: "Import menu vrátil data z jiné organizace.",
        code: "menu_import_org_mismatch"
      },
      { status: 403 }
    );
  }

  if (!result) {
    return Response.json(
      {
        error: "Import menu nevrátil uloženou verzi.",
        code: "menu_import_missing_result"
      },
      { status: 500 }
    );
  }

  return Response.json(
    {
      persisted: true,
      orgId: result.org_id,
      menuId: result.menu_id,
      menuVersionId: result.menu_version_id,
      sourceId: result.source_id,
      menuDate: result.menu_date,
      status: result.status,
      itemCount: payload.itemCount,
      warningCount: payload.warningCount,
      issues: payload.issues
    },
    { status: 201 }
  );
}
