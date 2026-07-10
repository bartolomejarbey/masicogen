import { requireStudioApiAccess } from "@/lib/studio-auth";
import {
  ManualPresentationStoreError,
  listManualPresentations,
  saveManualPresentation
} from "@/lib/manual-presentations";

const presentationEditorRoles = ["owner", "admin", "editor"] as const;

export async function GET() {
  const access = await requireStudioApiAccess();
  if (access instanceof Response) {
    return access;
  }
  if (access.mode !== "authenticated") {
    return Response.json({ presentations: [], persistenceAvailable: false });
  }

  try {
    return Response.json({
      presentations: await listManualPresentations(access.orgId),
      persistenceAvailable: true
    });
  } catch (error) {
    return storeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const access = await requireStudioApiAccess(presentationEditorRoles);
  if (access instanceof Response) {
    return access;
  }
  if (access.mode !== "authenticated") {
    return Response.json(
      {
        error: "Dlouhodobé ukládání je dostupné po přihlášení.",
        code: "presentation_auth_required"
      },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  try {
    const presentation = await saveManualPresentation({
      orgId: access.orgId,
      document: body
    });
    return Response.json({ ok: true, presentation }, { status: 201 });
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
