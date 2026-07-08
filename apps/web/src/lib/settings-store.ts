import { resolveSettings, type OrgSettings } from "@masico/shared";
import { studioAuthConfigured } from "./studio-auth";
import { createServerSupabaseClient } from "./supabase/server";

type OrganizationSettingsRow = {
  settings: unknown;
};

/**
 * Nastavení organizace s doplněnými defaulty. V lokálním demu bez Supabase
 * (a při nečitelném řádku přes RLS) vrací čisté defaulty.
 */
export async function loadResolvedSettings(orgId: string): Promise<OrgSettings> {
  if (!studioAuthConfigured()) {
    return resolveSettings({});
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle<OrganizationSettingsRow>();

  if (error) {
    // Deck se pak staví s defaulty — to nesmí projít bez stopy v logu.
    console.error(`loadResolvedSettings failed for org ${orgId}: ${error.message}`);
  }

  return resolveSettings(data?.settings ?? {});
}
