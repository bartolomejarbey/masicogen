import { z } from "zod";
import { generateAndStoreBackground } from "@/lib/background-assets";
import { requireConfiguredIntegration } from "@/lib/security";
import { requireStudioApiAccess, studioRoleGroups } from "@/lib/studio-auth";

const backgroundRequestSchema = z.object({
  prompt: z.string().trim().min(12).max(1200),
  quality: z.enum(["draft", "final"]).default("draft"),
  templateKind: z
    .enum(["daily_menu", "soup_mains", "special", "promo", "sold_out", "info", "allergen_legend"])
    .default("daily_menu")
});

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const access = await requireStudioApiAccess(studioRoleGroups.contentEditors);
  if (access instanceof Response) {
    return access;
  }

  const parsedBody = backgroundRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsedBody.success) {
    return Response.json(
      {
        error: "Požadavek na generování pozadí nemá platná data.",
        code: "invalid_background_generation_input",
        issues: parsedBody.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      },
      { status: 400 }
    );
  }

  if (access.mode === "demo") {
    const integrationUnavailable = requireConfiguredIntegration("Generování Image 2 pozadí");
    if (integrationUnavailable) {
      return integrationUnavailable;
    }
  }

  try {
    const asset = await generateAndStoreBackground({
      orgId: access.orgId,
      userId: access.userId ?? "00000000-0000-4000-8000-000000000000",
      prompt: parsedBody.data.prompt,
      quality: parsedBody.data.quality,
      templateKind: parsedBody.data.templateKind
    });

    return Response.json({
      persisted: true,
      ...asset,
      guardrails: [
        "Prompt vynucuje žádný čitelný text, čísla, loga ani falešné ceny.",
        "Jídla, ceny a alergeny se renderují až deterministickou textovou vrstvou."
      ]
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Generování pozadí selhalo.",
        code: "background_generation_failed"
      },
      { status: 502 }
    );
  }
}
