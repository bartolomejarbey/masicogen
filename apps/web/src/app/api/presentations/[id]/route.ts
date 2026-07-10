import { z } from "zod";
import { requireStudioApiAccess } from "@/lib/studio-auth";
import {
  ManualPresentationStoreError,
  archiveManualPresentation,
  saveManualPresentation
} from "@/lib/manual-presentations";

const presentationEditorRoles = ["owner", "admin", "editor"] as const;
const paramsSchema = z.object({ id: z.string().uuid() });
const updateSchema = z.object({
  expectedDeckVersionId: z.string().uuid(),
  document: z.unknown()
});
const archiveSchema = z.object({ expectedDeckVersionId: z.string().uuid() });

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireStudioApiAccess(presentationEditorRoles);
  if (access instanceof Response) {
    return access;
  }
  if (access.mode !== "authenticated") {
    return Response.json({ error: "Přihlášení je povinné." }, { status: 401 });
  }

  const params = paramsSchema.safeParse(await context.params);
  const body = updateSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return Response.json(
      { error: "Požadavek na uložení prezentace není platný.", code: "presentation_invalid_request" },
      { status: 400 }
    );
  }

  try {
    const presentation = await saveManualPresentation({
      orgId: access.orgId,
      deckId: params.data.id,
      expectedDeckVersionId: body.data.expectedDeckVersionId,
      document: body.data.document
    });
    return Response.json({ ok: true, presentation });
  } catch (error) {
    return storeErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireStudioApiAccess(presentationEditorRoles);
  if (access instanceof Response) {
    return access;
  }
  if (access.mode !== "authenticated") {
    return Response.json({ error: "Přihlášení je povinné." }, { status: 401 });
  }

  const params = paramsSchema.safeParse(await context.params);
  const body = archiveSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return Response.json(
      { error: "Požadavek na archivaci není platný.", code: "presentation_invalid_request" },
      { status: 400 }
    );
  }

  try {
    await archiveManualPresentation({
      deckId: params.data.id,
      expectedDeckVersionId: body.data.expectedDeckVersionId
    });
    return Response.json({ ok: true });
  } catch (error) {
    return storeErrorResponse(error);
  }
}

function storeErrorResponse(error: unknown) {
  if (error instanceof ManualPresentationStoreError) {
    return Response.json(
      { error: error.message, code: error.code, issues: error.issues ?? [] },
      { status: error.status }
    );
  }
  return Response.json(
    { error: "Operace s prezentací neočekávaně selhala.", code: "presentation_unexpected" },
    { status: 500 }
  );
}
