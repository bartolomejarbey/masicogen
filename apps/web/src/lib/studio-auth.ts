import { createServerSupabaseClient } from "./supabase/server";

export type StudioAccessRole =
  | "owner"
  | "admin"
  | "editor"
  | "designer"
  | "approver"
  | "publisher"
  | "viewer";

export type StudioAccessState =
  | {
      mode: "demo";
      required: false;
      reason: "local_demo";
    }
  | {
      mode: "locked";
      required: true;
      reason: "auth_not_configured" | "unauthenticated" | "membership_missing";
      title: string;
      message: string;
      action: string;
      loginHref: string | null;
    }
  | {
      mode: "authenticated";
      required: true;
      userId: string;
      email: string | null;
      orgId: string;
      role: StudioAccessRole;
    };

export const studioRoles = [
  "owner",
  "admin",
  "editor",
  "designer",
  "approver",
  "publisher",
  "viewer"
] satisfies StudioAccessRole[];

export const studioRoleGroups = {
  all: studioRoles,
  contentEditors: ["owner", "admin", "editor", "designer"],
  menuImporters: ["owner", "admin", "editor"],
  renderOperators: ["owner", "admin", "editor", "designer", "publisher"],
  screenManagers: ["owner", "admin", "publisher"]
} satisfies Record<string, readonly StudioAccessRole[]>;

type MembershipRow = {
  org_id: string;
  role: StudioAccessRole;
};

export type StudioApiAccess =
  | {
      mode: "demo";
      required: false;
      userId: null;
      email: null;
      orgId: string;
      role: "owner";
    }
  | Extract<StudioAccessState, { mode: "authenticated" }>;

const demoOrgId = "00000000-0000-4000-8000-000000000001";

export function studioAuthRequired(env: Partial<NodeJS.ProcessEnv> = process.env) {
  return env.NEXT_PUBLIC_APP_ENV === "production" || env.NODE_ENV === "production";
}

export function studioAuthConfigured(env: Partial<NodeJS.ProcessEnv> = process.env) {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function roleCanAccess(
  role: StudioAccessRole,
  allowedRoles: readonly StudioAccessRole[] = studioRoleGroups.all
) {
  return allowedRoles.includes(role);
}

export async function requireStudioApiAccess(
  allowedRoles: readonly StudioAccessRole[] = studioRoleGroups.all
): Promise<StudioApiAccess | Response> {
  const access = await getStudioAccessState();

  if (access.mode === "demo") {
    return {
      mode: "demo",
      required: false,
      userId: null,
      email: null,
      orgId: demoOrgId,
      role: "owner"
    };
  }

  if (access.mode === "locked") {
    return Response.json(
      {
        error: access.title,
        message: access.message,
        code: `studio_${access.reason}`
      },
      { status: studioLockStatus(access.reason) }
    );
  }

  if (!roleCanAccess(access.role, allowedRoles)) {
    return Response.json(
      {
        error: "Nedostatečné oprávnění.",
        message: "Váš účet nemá roli potřebnou pro tuto akci v TV Studiu.",
        code: "studio_forbidden"
      },
      { status: 403 }
    );
  }

  return access;
}

export async function getStudioAccessState(): Promise<StudioAccessState> {
  if (!studioAuthRequired()) {
    return {
      mode: "demo",
      required: false,
      reason: "local_demo"
    };
  }

  if (!studioAuthConfigured()) {
    return lockedStudioState(
      "auth_not_configured",
      "TV Studio je dočasně uzamčené",
      "Studio je v produkci zamčené, protože není dokončené produkční přihlášení. TV přehrávače tím nejsou dotčené.",
      "Doplňte NEXT_PUBLIC_SUPABASE_URL a NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      null
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: userResult, error: userError } = await supabase.auth.getUser();
  const user = userResult.user;

  if (userError || !user) {
    return lockedStudioState(
      "unauthenticated",
      "TV Studio je uzamčené",
      "Aplikace není rozbitá. Tato část je v produkci dostupná jen přihlášené obsluze MASI-CO.",
      "Přihlaste se přes Supabase Auth.",
      "/login?redirect=/"
    );
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("org_memberships")
    .select("org_id, role")
    .eq("user_id", user.id)
    .eq("active", true)
    .in("role", studioRoles)
    .limit(1)
    .returns<MembershipRow[]>();

  const membership = memberships?.[0];

  if (membershipError || !membership) {
    return lockedStudioState(
      "membership_missing",
      "Účet nemá přístup do TV Studia",
      "Jste přihlášeni, ale nemáte oprávnění pro TV Studio této provozovny.",
      "Požádejte vedoucího provozu nebo správce systému o přidání do organizace.",
      "/login?redirect=/"
    );
  }

  return {
    mode: "authenticated",
    required: true,
    userId: user.id,
    email: user.email ?? null,
    orgId: membership.org_id,
    role: membership.role
  };
}

function studioLockStatus(reason: Extract<StudioAccessState, { mode: "locked" }>["reason"]) {
  if (reason === "auth_not_configured") {
    return 503;
  }

  return reason === "unauthenticated" ? 401 : 403;
}

function lockedStudioState(
  reason: Extract<StudioAccessState, { mode: "locked" }>["reason"],
  title: string,
  message: string,
  action: string,
  loginHref: string | null
): Extract<StudioAccessState, { mode: "locked" }> {
  return {
    mode: "locked",
    required: true,
    reason,
    title,
    message,
    action,
    loginHref
  };
}
