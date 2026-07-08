import {
  isTemplateManifestV2,
  anyTemplateManifestSchema,
  type TemplateManifestV2
} from "@masico/shared";
import { createServerSupabaseClient } from "./supabase/server";

export type TemplateOverride = {
  slug: string;
  version: number;
  manifest: TemplateManifestV2;
};

type TemplateRow = {
  id: string;
  slug: string;
  current_version_id: string | null;
};

type VersionRow = {
  id: string;
  template_id: string;
  version: number;
  manifest_json: unknown;
};

/**
 * Načte org-specifické verze šablon uložené editorem. Vestavěné šablony
 * z packages/shared jsou výchozí; DB verze (v2) mají přednost.
 */
export async function loadTemplateOverrides(
  orgId: string
): Promise<Map<string, TemplateOverride>> {
  const overrides = new Map<string, TemplateOverride>();
  const supabase = await createServerSupabaseClient();

  const { data: templates } = await supabase
    .from("templates")
    .select("id, slug, current_version_id")
    .eq("org_id", orgId)
    .returns<TemplateRow[]>();

  const versionIds = (templates ?? [])
    .map((template) => template.current_version_id)
    .filter((id): id is string => Boolean(id));

  if (versionIds.length === 0) {
    return overrides;
  }

  const { data: versions } = await supabase
    .from("template_versions")
    .select("id, template_id, version, manifest_json")
    .eq("org_id", orgId)
    .in("id", versionIds)
    .returns<VersionRow[]>();

  for (const template of templates ?? []) {
    const versionRow = versions?.find((row) => row.id === template.current_version_id);
    if (!versionRow) {
      continue;
    }

    const parsed = anyTemplateManifestSchema.safeParse(versionRow.manifest_json);
    if (!parsed.success || !isTemplateManifestV2(parsed.data)) {
      continue;
    }

    overrides.set(template.slug, {
      slug: template.slug,
      version: versionRow.version,
      manifest: parsed.data
    });
  }

  return overrides;
}
