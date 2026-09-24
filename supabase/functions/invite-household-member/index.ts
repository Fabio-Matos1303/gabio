import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";

const requestSchema = z.object({
  householdId: z.string().uuid(),
  email: z.string().trim().email().max(254),
});
const authenticatedUserSchema = z
  .object({ id: z.string().uuid() })
  .passthrough();
const invitationIdSchema = z.string().uuid();

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const publicAppUrl = Deno.env.get("PUBLIC_APP_URL") ?? "";

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), 10_000);
  const signals = [timeoutController.signal, init?.signal].filter(
    (signal): signal is AbortSignal => Boolean(signal),
  );
  try {
    return await fetch(input, {
      ...init,
      signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
    });
  } finally {
    clearTimeout(timeout);
  }
}

function corsHeaders(origin: string) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers":
      "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "Origin",
  };
}

function jsonResponse(body: unknown, status: number, origin: string | null) {
  const allowedOrigin = origin === publicAppUrl ? origin : publicAppUrl;
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(allowedOrigin),
    },
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (!publicAppUrl || origin !== publicAppUrl) {
    return jsonResponse({ error: "Origem não autorizada." }, 403, origin);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(publicAppUrl),
    });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405, origin);
  }

  const authorization = request.headers.get("authorization");
  if (!authorization || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(
      { error: "Não foi possível concluir o convite." },
      401,
      origin,
    );
  }

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonResponse({ error: "Dados de convite inválidos." }, 400, origin);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      fetch: fetchWithTimeout,
      headers: { Authorization: authorization },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !authenticatedUserSchema.safeParse(userData.user).success) {
    return jsonResponse({ error: "Sessão inválida." }, 401, origin);
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const { data: invitationId, error: invitationError } = await userClient.rpc(
    "request_household_invitation",
    {
      target_household_id: parsed.data.householdId,
      invite_email: normalizedEmail,
    },
  );
  const parsedInvitationId = invitationIdSchema.safeParse(invitationId);
  if (invitationError || !parsedInvitationId.success) {
    return jsonResponse(
      { error: "Não foi possível concluir o convite." },
      400,
      origin,
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { fetch: fetchWithTimeout },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const redirectUrl = new URL(publicAppUrl);
  redirectUrl.searchParams.set("join", parsedInvitationId.data);
  const redirectTo = redirectUrl.toString();
  const { error: authInviteError } =
    await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo,
    });

  if (authInviteError) {
    if (authInviteError.status === 422) {
      const { error: recoveryError } =
        await userClient.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo,
        });
      if (!recoveryError) {
        return jsonResponse({ delivered: true }, 200, origin);
      }
    }

    await userClient.rpc("revoke_household_invitation_by_id", {
      invitation_id: parsedInvitationId.data,
    });
    return jsonResponse(
      { error: "Não foi possível concluir o convite." },
      400,
      origin,
    );
  }

  return jsonResponse({ delivered: true }, 200, origin);
});
