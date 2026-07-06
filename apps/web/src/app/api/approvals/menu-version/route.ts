import {
  approvalRpcStatus,
  menuVersionApprovalRequestSchema,
  normalizeApprovalComment,
  zodIssues
} from "@/lib/approval-api";
import { requireStudioApiAccess, studioRoleGroups } from "@/lib/studio-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ApproveMenuVersionRpcRow = {
  menu_version_id: string;
  approval_request_id: string;
  approval_step_id: string;
  status: string;
  approved_at: string;
};

export async function POST(request: Request) {
  const access = await requireStudioApiAccess(studioRoleGroups.approvers);
  if (access instanceof Response) {
    return access;
  }

  const parsedBody = menuVersionApprovalRequestSchema.safeParse(
    await request.json().catch(() => ({}))
  );

  if (!parsedBody.success) {
    return Response.json(
      {
        error: "Schválení menu nemá platná vstupní data.",
        code: "invalid_menu_approval_input",
        issues: zodIssues(parsedBody.error)
      },
      { status: 400 }
    );
  }

  const comment = normalizeApprovalComment(parsedBody.data.comment);

  if (access.mode === "demo") {
    return Response.json({
      persisted: false,
      mode: "demo",
      menuVersionId: parsedBody.data.menuVersionId,
      status: "approved",
      approvedAt: new Date().toISOString(),
      note: "Lokální demo schválení nic neukládá. Produkce volá approve_menu_version přes Supabase Auth."
    });
  }

  const supabase = await createServerSupabaseClient();
  const { data: rawData, error } = await supabase.rpc("approve_menu_version", {
    target_menu_version_id: parsedBody.data.menuVersionId,
    approval_comment: comment
  });

  if (error) {
    return Response.json(
      {
        error: `Menu verzi se nepodařilo schválit: ${error.message}`,
        code: "menu_approval_rpc_failed"
      },
      { status: approvalRpcStatus(error) }
    );
  }

  const result = (rawData as ApproveMenuVersionRpcRow[] | null)?.[0];
  if (!result) {
    return Response.json(
      {
        error: "Schválení menu nevrátilo uložený krok.",
        code: "menu_approval_missing_result"
      },
      { status: 500 }
    );
  }

  return Response.json({
    persisted: true,
    menuVersionId: result.menu_version_id,
    approvalRequestId: result.approval_request_id,
    approvalStepId: result.approval_step_id,
    status: result.status,
    approvedAt: result.approved_at
  });
}
