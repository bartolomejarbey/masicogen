import { menuExtractionResultSchema } from "@masico/shared";
import { z } from "zod";
import {
  approveMenuAndBuildDeck,
  AutopilotBlockedError,
  AutopilotError
} from "@/lib/autopilot";
import { requireStudioApiAccess } from "@/lib/studio-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const approveDayRequestSchema = z.object({
  menuVersionId: z.string().uuid(),
  menuDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  locationId: z.string().uuid(),
  canteenId: z.string().uuid()
});

type MenuVersionRow = {
  id: string;
  menu_id: string;
  status: string;
  snapshot: unknown;
};

export async function POST(request: Request) {
  // Množina rolí odpovídá RPC approve_menu_version/approve_deck_version —
  // renderOperators by pustili editora, kterého by RPC vzápětí odmítlo.
  const access = await requireStudioApiAccess(["owner", "admin", "approver", "publisher"]);
  if (access instanceof Response) {
    return access;
  }

  if (access.mode !== "authenticated") {
    return Response.json(
      {
        error: "Schválení dne je dostupné jen po přihlášení do produkčního studia.",
        code: "approve_day_auth_required"
      },
      { status: 401 }
    );
  }

  const parsedBody = approveDayRequestSchema.safeParse(await request.json().catch(() => ({})));

  if (!parsedBody.success) {
    return Response.json(
      {
        error: "Schválení dne nemá platná vstupní data.",
        code: "invalid_approve_day_input",
        issues: parsedBody.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      },
      { status: 400 }
    );
  }

  const body = parsedBody.data;
  const supabase = await createServerSupabaseClient();

  const { data: versionRow, error: versionError } = await supabase
    .from("menu_versions")
    .select("id, menu_id, status, snapshot")
    .eq("org_id", access.orgId)
    .eq("id", body.menuVersionId)
    .maybeSingle<MenuVersionRow>();

  if (versionError) {
    return Response.json(
      {
        error: `Načtení menu selhalo: ${versionError.message}`,
        code: "approve_day_menu_load_failed"
      },
      { status: 502 }
    );
  }

  if (!versionRow) {
    return Response.json(
      {
        error: "Verze menu nebyla nalezena. Obnovte stránku a zkuste to znovu.",
        code: "approve_day_menu_not_found"
      },
      { status: 404 }
    );
  }

  const parsedMenu = menuExtractionResultSchema.safeParse(versionRow.snapshot);

  if (!parsedMenu.success) {
    return Response.json(
      {
        error: "Uložené menu má nečitelný formát — otevřete den a uložte ho znovu.",
        code: "approve_day_snapshot_invalid"
      },
      { status: 422 }
    );
  }

  try {
    const result = await approveMenuAndBuildDeck(supabase, {
      orgId: access.orgId,
      locationId: body.locationId,
      canteenId: body.canteenId,
      menuVersionId: body.menuVersionId,
      menu: parsedMenu.data,
      menuDate: body.menuDate
    });

    return Response.json({
      ok: true,
      deckId: result.deckId,
      deckVersionId: result.deckVersionId,
      audit: result.audit
    });
  } catch (error) {
    if (error instanceof AutopilotBlockedError) {
      return Response.json(
        { error: error.message, code: error.code, issues: error.issues },
        { status: error.status }
      );
    }

    if (error instanceof AutopilotError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("approve-day: unexpected failure", error);

    return Response.json(
      {
        error: "Schválení dne nečekaně selhalo. Zkuste to prosím znovu.",
        code: "approve_day_unexpected"
      },
      { status: 500 }
    );
  }
}
