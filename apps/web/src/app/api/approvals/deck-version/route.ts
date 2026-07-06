import {
  approvalRpcStatus,
  deckVersionApprovalRequestSchema,
  normalizeApprovalComment,
  zodIssues
} from "@/lib/approval-api";
import { requireStudioApiAccess, studioRoleGroups } from "@/lib/studio-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ApproveDeckVersionRpcRow = {
  deck_version_id: string;
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

  const parsedBody = deckVersionApprovalRequestSchema.safeParse(
    await request.json().catch(() => ({}))
  );

  if (!parsedBody.success) {
    return Response.json(
      {
        error: "Schválení TV smyčky nemá platná vstupní data.",
        code: "invalid_deck_approval_input",
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
      deckVersionId: parsedBody.data.deckVersionId,
      status: "approved",
      approvedAt: new Date().toISOString(),
      note: "Lokální demo schválení nic neukládá. Produkce volá approve_deck_version přes Supabase Auth."
    });
  }

  const supabase = await createServerSupabaseClient();
  const { data: rawData, error } = await supabase.rpc("approve_deck_version", {
    target_deck_version_id: parsedBody.data.deckVersionId,
    approval_comment: comment
  });

  if (error) {
    return Response.json(
      {
        error: `TV smyčku se nepodařilo schválit: ${error.message}`,
        code: "deck_approval_rpc_failed"
      },
      { status: approvalRpcStatus(error) }
    );
  }

  const result = (rawData as ApproveDeckVersionRpcRow[] | null)?.[0];
  if (!result) {
    return Response.json(
      {
        error: "Schválení TV smyčky nevrátilo uložený krok.",
        code: "deck_approval_missing_result"
      },
      { status: 500 }
    );
  }

  return Response.json({
    persisted: true,
    deckVersionId: result.deck_version_id,
    approvalRequestId: result.approval_request_id,
    approvalStepId: result.approval_step_id,
    status: result.status,
    approvedAt: result.approved_at
  });
}
