import { randomBytes } from "node:crypto";
import {
  playerTokenHashingConfigured,
  requireConfiguredIntegration
} from "@/lib/security";
import {
  buildScreenPairingPayload,
  getDemoScreenPairingInput,
  screenPairingRequestSchema,
  validateProductionScreenPairing
} from "@/lib/screen-pairing";
import { requireStudioApiAccess, studioRoleGroups } from "@/lib/studio-auth";
import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase-admin";

type LocationScopeRow = {
  location_id: string;
};

type ScreenRow = {
  id: string;
  location_id: string;
};

export async function POST(request: Request) {
  const access = await requireStudioApiAccess(studioRoleGroups.screenManagers);
  if (access instanceof Response) {
    return access;
  }

  const rawBody = await request.json().catch(() => ({}));
  const parsedBody = screenPairingRequestSchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return Response.json(
      {
        error: "Párování obrazovky nemá platná vstupní data.",
        code: "invalid_screen_pairing_input",
        issues: parsedBody.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      },
      { status: 400 }
    );
  }

  const rawToken = randomBytes(24).toString("base64url");

  if (access.mode === "demo") {
    const demoInput = getDemoScreenPairingInput(parsedBody.data);
    const payload = withoutTokenHash(buildScreenPairingPayload({
      requestUrl: request.url,
      orgId: access.orgId,
      rawToken,
      persisted: false,
      ...demoInput
    }));

    return Response.json({
      ...payload,
      note: "Lokální demo párování nic neukládá. Produkce vytvoří screens/screen_tokens a raw token ukáže jen jednou."
    });
  }

  if (!supabaseAdminConfigured()) {
    const integrationUnavailable = requireConfiguredIntegration("Párování obrazovky");
    if (integrationUnavailable) {
      return integrationUnavailable;
    }
  }

  if (!playerTokenHashingConfigured()) {
    return Response.json(
      {
        error: "PLAYER_TOKEN_PEPPER není nakonfigurovaný.",
        code: "player_token_pepper_missing"
      },
      { status: 503 }
    );
  }

  const missingFields = validateProductionScreenPairing(parsedBody.data);
  if (missingFields.length > 0) {
    return Response.json(
      {
        error: "Produkční párování potřebuje provozovnu a jídelnu.",
        code: "screen_pairing_missing_scope",
        missingFields
      },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return Response.json(
      {
        error: "Supabase service role není nakonfigurovaná.",
        code: "screen_pairing_storage_not_configured"
      },
      { status: 503 }
    );
  }

  const locationId = parsedBody.data.locationId!;
  const canteenId = parsedBody.data.canteenId!;
  const scopeError = await assertLocationScope({
    orgId: access.orgId,
    userId: access.userId,
    locationId,
    currentScreenId: parsedBody.data.screenId
  });

  if (scopeError) {
    return scopeError;
  }

  const { data: canteen, error: canteenError } = await supabase
    .from("canteens")
    .select("id")
    .eq("org_id", access.orgId)
    .eq("location_id", locationId)
    .eq("id", canteenId)
    .maybeSingle<{ id: string }>();

  if (canteenError) {
    return Response.json(
      {
        error: `Kontrola jídelny selhala: ${canteenError.message}`,
        code: "screen_pairing_canteen_lookup_failed"
      },
      { status: 500 }
    );
  }

  if (!canteen) {
    return Response.json(
      {
        error: "Jídelna pro párování nebyla nalezena v této provozovně.",
        code: "screen_pairing_canteen_not_found"
      },
      { status: 404 }
    );
  }

  const screenId = await upsertScreen({
    orgId: access.orgId,
    screenId: parsedBody.data.screenId,
    locationId,
    canteenId,
    screenName: parsedBody.data.screenName
  });

  if (screenId instanceof Response) {
    return screenId;
  }

  const payloadWithHash = buildScreenPairingPayload({
    requestUrl: request.url,
    orgId: access.orgId,
    screenId,
    screenName: parsedBody.data.screenName,
    locationId,
    canteenId,
    rawToken,
    expiresInMinutes: parsedBody.data.expiresInMinutes,
    persisted: true
  });

  const now = new Date().toISOString();
  const revoke = await supabase
    .from("screen_tokens")
    .update({ revoked_at: now })
    .eq("org_id", access.orgId)
    .eq("screen_id", screenId)
    .is("revoked_at", null);

  if (revoke.error) {
    return Response.json(
      {
        error: `Rotace starých tokenů selhala: ${revoke.error.message}`,
        code: "screen_pairing_revoke_failed"
      },
      { status: 500 }
    );
  }

  const tokenInsert = await supabase.from("screen_tokens").insert({
    org_id: access.orgId,
    screen_id: screenId,
    token_hash: payloadWithHash.tokenHash,
    expires_at: payloadWithHash.expiresAt
  });

  if (tokenInsert.error) {
    return Response.json(
      {
        error: `Uložení tokenu obrazovky selhalo: ${tokenInsert.error.message}`,
        code: "screen_pairing_token_insert_failed"
      },
      { status: 500 }
    );
  }

  const audit = await supabase.from("audit_log").insert({
    org_id: access.orgId,
    actor_id: access.userId,
    action: "pair_screen",
    entity_type: "screen",
    entity_id: screenId,
    after_json: {
      screen_id: screenId,
      location_id: locationId,
      canteen_id: canteenId,
      expires_at: payloadWithHash.expiresAt,
      rotated_existing_tokens: true
    }
  });

  if (audit.error) {
    return Response.json(
      {
        error: `Audit párování selhal: ${audit.error.message}`,
        code: "screen_pairing_audit_failed"
      },
      { status: 500 }
    );
  }

  const payload = withoutTokenHash(payloadWithHash);
  return Response.json(
    {
      ...payload,
      note: "Raw token se zobrazuje jen jednou. V databázi je uložený pouze hash."
    },
    { status: parsedBody.data.screenId ? 200 : 201 }
  );
}

async function assertLocationScope(input: {
  orgId: string;
  userId: string;
  locationId: string;
  currentScreenId?: string;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return Response.json({ error: "Supabase service role není nakonfigurovaná." }, { status: 503 });
  }

  const { data: scopes, error: scopeError } = await supabase
    .from("membership_location_scopes")
    .select("location_id")
    .eq("org_id", input.orgId)
    .eq("user_id", input.userId)
    .returns<LocationScopeRow[]>();

  if (scopeError) {
    return Response.json(
      {
        error: `Kontrola rozsahu provozovny selhala: ${scopeError.message}`,
        code: "screen_pairing_scope_lookup_failed"
      },
      { status: 500 }
    );
  }

  const allowedLocations = new Set((scopes ?? []).map((scope) => scope.location_id));
  if (allowedLocations.size > 0 && !allowedLocations.has(input.locationId)) {
    return Response.json(
      {
        error: "Nemáte oprávnění párovat TV pro tuto provozovnu.",
        code: "screen_pairing_location_forbidden"
      },
      { status: 403 }
    );
  }

  if (input.currentScreenId) {
    const { data: currentScreen, error } = await supabase
      .from("screens")
      .select("id, location_id")
      .eq("org_id", input.orgId)
      .eq("id", input.currentScreenId)
      .maybeSingle<ScreenRow>();

    if (error) {
      return Response.json(
        {
          error: `Kontrola existující obrazovky selhala: ${error.message}`,
          code: "screen_pairing_screen_lookup_failed"
        },
        { status: 500 }
      );
    }

    if (!currentScreen) {
      return Response.json(
        {
          error: "Obrazovka pro rotaci tokenu nebyla nalezena.",
          code: "screen_pairing_screen_not_found"
        },
        { status: 404 }
      );
    }

    if (allowedLocations.size > 0 && !allowedLocations.has(currentScreen.location_id)) {
      return Response.json(
        {
          error: "Nemáte oprávnění obnovit token této TV obrazovky.",
          code: "screen_pairing_existing_location_forbidden"
        },
        { status: 403 }
      );
    }
  }

  return null;
}

async function upsertScreen(input: {
  orgId: string;
  screenId?: string;
  locationId: string;
  canteenId: string;
  screenName: string;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return Response.json({ error: "Supabase service role není nakonfigurovaná." }, { status: 503 });
  }

  if (input.screenId) {
    const { data, error } = await supabase
      .from("screens")
      .update({
        location_id: input.locationId,
        canteen_id: input.canteenId,
        name: input.screenName,
        status: "paired"
      })
      .eq("org_id", input.orgId)
      .eq("id", input.screenId)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) {
      return Response.json(
        {
          error: `Aktualizace obrazovky selhala: ${error.message}`,
          code: "screen_pairing_screen_update_failed"
        },
        { status: 500 }
      );
    }

    if (!data) {
      return Response.json(
        {
          error: "Obrazovka pro párování nebyla nalezena.",
          code: "screen_pairing_screen_not_found"
        },
        { status: 404 }
      );
    }

    return data.id;
  }

  const { data, error } = await supabase
    .from("screens")
    .insert({
      org_id: input.orgId,
      location_id: input.locationId,
      canteen_id: input.canteenId,
      name: input.screenName,
      status: "paired"
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    return Response.json(
      {
        error: `Vytvoření obrazovky selhalo: ${error.message}`,
        code: "screen_pairing_screen_insert_failed"
      },
      { status: 500 }
    );
  }

  return data.id;
}

function withoutTokenHash<T extends { tokenHash: string }>(payload: T) {
  const { tokenHash: _removed, ...safePayload } = payload;
  void _removed;
  return safePayload;
}
