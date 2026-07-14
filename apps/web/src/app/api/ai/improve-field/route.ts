import { z } from "zod";
import { improveFieldText } from "@/lib/openai";
import { requireStudioApiAccess } from "@/lib/studio-auth";

const editorRoles = ["owner", "admin", "editor"] as const;

const improveFieldSchema = z.object({
  field: z.enum(["name", "description"]),
  value: z.string().trim().min(1).max(280),
  context: z.string().trim().max(200).optional()
});

/**
 * Vylepší JEDNU kolonku (název / popis jídla) pomocí AI a vrátí jen upravený
 * text. Použití: tlačítko „vylepšit AI" u konkrétní kolonky. Bez
 * OPENAI_API_KEY (lokálně) vrací lehce učesaný text, ať tlačítko funguje i v
 * developmentu.
 */
export async function POST(request: Request) {
  const access = await requireStudioApiAccess(editorRoles);
  if (access instanceof Response) {
    return access;
  }
  if (access.mode !== "authenticated") {
    return Response.json(
      { error: "Vylepšení kolonky je dostupné po přihlášení.", code: "improve_field_auth_required" },
      { status: 401 }
    );
  }

  const parsed = improveFieldSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: "Neplatný požadavek na vylepšení kolonky.", code: "improve_field_invalid_input" },
      { status: 400 }
    );
  }

  try {
    const text = await improveFieldText(parsed.data);
    return Response.json({ text });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Vylepšení kolonky selhalo.",
        code: "improve_field_failed"
      },
      { status: 502 }
    );
  }
}
