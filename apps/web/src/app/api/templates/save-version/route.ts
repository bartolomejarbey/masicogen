import { templateManifestV2Schema, type TemplateManifestV2 } from "@masico/shared";
import { z } from "zod";
import { requireStudioApiAccess } from "@/lib/studio-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const saveTemplateSchema = z.object({
  templateId: z.string().min(1).max(80),
  manifest: templateManifestV2Schema,
  baseVersion: z.number().int().positive().nullable().default(null)
});

type SaveRow = {
  template_id: string;
  template_version_id: string;
  version: number;
};

const minFontByRole: Record<string, number> = {
  headline: 72,
  subheadline: 44,
  item: 44,
  price: 44,
  note: 30,
  legend: 30
};

export async function POST(request: Request) {
  const access = await requireStudioApiAccess(["owner", "admin", "designer"]);
  if (access instanceof Response) {
    return access;
  }

  if (access.mode !== "authenticated") {
    return Response.json(
      { error: "Ukládání šablon je dostupné po přihlášení.", code: "template_save_auth_required" },
      { status: 401 }
    );
  }

  const parsed = saveTemplateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      {
        error: "Šablona má neplatná data.",
        code: "template_save_invalid_input",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      },
      { status: 400 }
    );
  }

  const guardrailProblems = validateGuardrails(parsed.data.manifest);
  if (guardrailProblems.length > 0) {
    return Response.json(
      {
        error: "Šablona porušuje pravidla čitelnosti na TV.",
        code: "template_save_guardrails",
        issues: guardrailProblems.map((message) => ({ code: "guardrail", message }))
      },
      { status: 422 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const saved = await supabase.rpc("save_template_version", {
    target_org_id: access.orgId,
    target_template_slug: parsed.data.templateId,
    template_manifest: parsed.data.manifest,
    base_version: parsed.data.baseVersion
  });

  if (saved.error) {
    const conflict = saved.error.message.includes("Template version conflict");
    return Response.json(
      {
        error: conflict
          ? "Šablonu mezitím uložil někdo jiný. Načtěte stránku znovu a úpravy zopakujte."
          : `Uložení šablony selhalo: ${saved.error.message}`,
        code: conflict ? "template_save_conflict" : "template_save_failed"
      },
      { status: conflict ? 409 : 500 }
    );
  }

  const row = (saved.data as SaveRow[] | null)?.[0];
  if (!row) {
    return Response.json(
      { error: "Uložení šablony nevrátilo novou verzi.", code: "template_save_missing_result" },
      { status: 500 }
    );
  }

  return Response.json({
    ok: true,
    templateId: row.template_id,
    templateVersionId: row.template_version_id,
    version: row.version
  });
}

function validateGuardrails(manifest: TemplateManifestV2) {
  const problems: string[] = [];

  for (const layer of manifest.layers) {
    const { frame } = layer;

    if (
      frame.x < 0 ||
      frame.y < 0 ||
      frame.x + frame.w > manifest.canvas.width ||
      frame.y + frame.h > manifest.canvas.height
    ) {
      problems.push(`Prvek „${layer.id}" přesahuje mimo obrazovku.`);
    }

    if (layer.type === "text") {
      const minimum = minFontByRole[layer.role] ?? 30;
      if (layer.fontSizePx < minimum) {
        problems.push(
          `Text „${layer.id}" má písmo ${layer.fontSizePx} px — z dálky nečitelné (minimum ${minimum} px).`
        );
      }
    }
  }

  return problems;
}
