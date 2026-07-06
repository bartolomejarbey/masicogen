import {
  approvalRpcStatus,
  normalizeApprovalComment,
  screenPublishRequestSchema,
  zodIssues
} from "@/lib/approval-api";
import { isUuidLike } from "@/lib/security";
import { requireStudioApiAccess, studioRoleGroups } from "@/lib/studio-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type PublishDeckToScreenRpcRow = {
  screen_id: string;
  deck_version_id: string;
  export_id: string;
  publish_event_id: string;
  screen_status: string;
  published_at: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ screenId: string }> }
) {
  const access = await requireStudioApiAccess(studioRoleGroups.screenManagers);
  if (access instanceof Response) {
    return access;
  }

  const { screenId } = await params;
  if (!isUuidLike(screenId)) {
    return Response.json(
      {
        error: "Neplatné ID obrazovky.",
        code: "invalid_screen_id"
      },
      { status: 400 }
    );
  }

  const parsedBody = screenPublishRequestSchema.safeParse(
    await request.json().catch(() => ({}))
  );

  if (!parsedBody.success) {
    return Response.json(
      {
        error: "Publikace TV smyčky nemá platná vstupní data.",
        code: "invalid_screen_publish_input",
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
      screenId,
      deckVersionId: parsedBody.data.deckVersionId,
      exportId: parsedBody.data.exportId,
      publishEventId: "demo-publish-event",
      screenStatus: "published",
      publishedAt: new Date().toISOString(),
      note: "Lokální demo publikace nic neukládá. Produkce volá publish_deck_to_screen přes Supabase Auth."
    });
  }

  const supabase = await createServerSupabaseClient();
  const { data: rawData, error } = await supabase.rpc("publish_deck_to_screen", {
    target_screen_id: screenId,
    target_deck_version_id: parsedBody.data.deckVersionId,
    target_export_id: parsedBody.data.exportId,
    publish_comment: comment
  });

  if (error) {
    return Response.json(
      {
        error: `TV smyčku se nepodařilo publikovat: ${error.message}`,
        code: "screen_publish_rpc_failed"
      },
      { status: approvalRpcStatus(error) }
    );
  }

  const result = (rawData as PublishDeckToScreenRpcRow[] | null)?.[0];
  if (!result) {
    return Response.json(
      {
        error: "Publikace TV smyčky nevrátila uložený publish event.",
        code: "screen_publish_missing_result"
      },
      { status: 500 }
    );
  }

  return Response.json({
    persisted: true,
    screenId: result.screen_id,
    deckVersionId: result.deck_version_id,
    exportId: result.export_id,
    publishEventId: result.publish_event_id,
    screenStatus: result.screen_status,
    publishedAt: result.published_at
  });
}
