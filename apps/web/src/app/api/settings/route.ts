import { orgSettingsSchema, resolveSettings } from "@masico/shared";
import { requireStudioApiAccess } from "@/lib/studio-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const allowedSectionKeys = ["loop", "content", "branding", "automation", "export"] as const;

type OrganizationSettingsRow = {
  settings: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET() {
  const access = await requireStudioApiAccess();
  if (access instanceof Response) {
    return access;
  }

  if (access.mode !== "authenticated") {
    return Response.json({ settings: resolveSettings({}), raw: {} });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", access.orgId)
    .maybeSingle<OrganizationSettingsRow>();

  if (error) {
    return Response.json(
      { error: `Načtení nastavení selhalo: ${error.message}`, code: "settings_load_failed" },
      { status: 500 }
    );
  }

  const raw = isPlainObject(data?.settings) ? data.settings : {};
  return Response.json({ settings: resolveSettings(raw), raw });
}

export async function PATCH(request: Request) {
  const access = await requireStudioApiAccess(["owner", "admin"]);
  if (access instanceof Response) {
    return access;
  }

  if (access.mode !== "authenticated") {
    return Response.json(
      { error: "V demo režimu se nastavení neukládá.", code: "settings_demo_readonly" },
      { status: 401 }
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const patch = isPlainObject(body) ? body.patch : null;

  if (!isPlainObject(patch) || Object.keys(patch).length === 0) {
    return Response.json(
      { error: "Chybí data nastavení k uložení.", code: "settings_invalid_patch" },
      { status: 400 }
    );
  }

  for (const [key, section] of Object.entries(patch)) {
    if (!(allowedSectionKeys as readonly string[]).includes(key) || !isPlainObject(section)) {
      return Response.json(
        {
          error: "Nastavení obsahuje část, kterou neznáme — nic jsme neuložili.",
          code: "settings_unknown_section",
          issues: [{ path: key, message: "Neznámá nebo neplatná sekce nastavení." }]
        },
        { status: 400 }
      );
    }
  }

  const supabase = await createServerSupabaseClient();
  const { data: orgRow, error: loadError } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", access.orgId)
    .maybeSingle<OrganizationSettingsRow>();

  if (loadError) {
    return Response.json(
      { error: `Načtení nastavení selhalo: ${loadError.message}`, code: "settings_load_failed" },
      { status: 500 }
    );
  }

  // Stejný merge jako RPC update_org_settings: mělce per top-level sekce.
  const raw = isPlainObject(orgRow?.settings) ? orgRow.settings : {};
  const merged: Record<string, unknown> = { ...raw };
  for (const [key, section] of Object.entries(patch)) {
    const before = isPlainObject(raw[key]) ? raw[key] : {};
    merged[key] = { ...before, ...(section as Record<string, unknown>) };
  }

  const parsed = orgSettingsSchema.safeParse(merged);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Nastavení obsahuje neplatné hodnoty — nic jsme neuložili.",
        code: "settings_invalid_values",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      },
      { status: 400 }
    );
  }

  // Zod neznámé klíče tiše zahazuje — proto kontrola, že každá hodnota
  // z patche opravdu přežila parse beze změny. Neznámý klíč = 400, ne tiché smazání.
  const rejectedPaths = collectRejectedPaths(patch, parsed.data);
  if (rejectedPaths.length > 0) {
    return Response.json(
      {
        error: "Nastavení obsahuje položky, které neznáme — nic jsme neuložili.",
        code: "settings_unknown_fields",
        issues: rejectedPaths.map((path) => ({
          path,
          message: "Tuto položku nastavení neznáme nebo má špatnou hodnotu."
        }))
      },
      { status: 400 }
    );
  }

  const saved = await supabase.rpc("update_org_settings", {
    target_org_id: access.orgId,
    settings_patch: patch
  });

  if (saved.error) {
    return Response.json(
      {
        error: `Uložení nastavení selhalo: ${saved.error.message}`,
        code: "settings_save_failed"
      },
      { status: rpcStatus(saved.error) }
    );
  }

  return Response.json({ ok: true, settings: resolveSettings(saved.data) });
}

/** Cesty z patche, jejichž hodnota po validaci nesedí (neznámý klíč / upravená hodnota). */
function collectRejectedPaths(patchValue: unknown, parsedValue: unknown, path = ""): string[] {
  if (isPlainObject(patchValue)) {
    if (!isPlainObject(parsedValue)) {
      return [path || "(root)"];
    }

    const problems: string[] = [];
    for (const [key, value] of Object.entries(patchValue)) {
      problems.push(...collectRejectedPaths(value, parsedValue[key], path ? `${path}.${key}` : key));
    }
    return problems;
  }

  return Object.is(patchValue, parsedValue) ? [] : [path || "(root)"];
}

function rpcStatus(error: { code?: string }) {
  switch (error.code) {
    case "28000":
      return 401;
    case "42501":
      return 403;
    case "P0002":
      return 404;
    case "22023":
    case "23502":
    case "23514":
      return 422;
    default:
      return 500;
  }
}
