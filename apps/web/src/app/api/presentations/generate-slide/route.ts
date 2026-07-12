import { z } from "zod";
import { manualPresentationLayoutSchema } from "@masico/shared";
import { generateSlideContent } from "@/lib/openai";
import { requireStudioApiAccess } from "@/lib/studio-auth";

const presentationEditorRoles = ["owner", "admin", "editor"] as const;

const generateSlideSchema = z.object({
  layoutId: manualPresentationLayoutSchema,
  hint: z.string().trim().max(200).optional(),
  avoidNames: z.array(z.string().trim().max(160)).max(40).optional()
});

/**
 * Navrhne obsah jednoho slidu (názvy jídel, ceny, alergeny) podle jeho typu.
 * Výsledek je jen návrh — editor ho zobrazí do kolonek a člověk ho upraví.
 * Bez OPENAI_API_KEY (lokálně) vrací realistický vzorek, takže tlačítko
 * funguje i v developmentu.
 */
export async function POST(request: Request) {
  const access = await requireStudioApiAccess(presentationEditorRoles);
  if (access instanceof Response) {
    return access;
  }
  if (access.mode !== "authenticated") {
    return Response.json(
      { error: "Generování slidu je dostupné po přihlášení.", code: "generate_slide_auth_required" },
      { status: 401 }
    );
  }

  const parsed = generateSlideSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: "Neplatný požadavek na generování slidu.", code: "generate_slide_invalid_input" },
      { status: 400 }
    );
  }

  try {
    const sections = await generateSlideContent({
      layoutId: parsed.data.layoutId,
      hint: parsed.data.hint,
      avoidNames: parsed.data.avoidNames
    });
    return Response.json({ sections });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Generování slidu selhalo.",
        code: "generate_slide_failed"
      },
      { status: 502 }
    );
  }
}
