import {
  authorizationUrl,
  CALENDAR_SCOPE,
  hashSecret,
  parsePreferences,
  randomSecret,
  seal,
  unseal,
  GoogleCalendarProvider,
} from "./google-calendar-provider.ts";
export type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<unknown>;
export type CalendarConfig = {
  enabled: boolean;
  appUrl: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  encryptionKey: string;
};
export type CalendarServiceDependencies = {
  config: CalendarConfig;
  rpc: Rpc;
  authenticate: (authorization: string) => Promise<string | null>;
  provider?: GoogleCalendarProvider;
};
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid data");
  return value as Record<string, unknown>;
}
export function sanitizeStatus(value: unknown): {
  connection: null | {
    status: string;
    exportHousehold: boolean;
    exportPrivate: boolean;
    reminderMinutes: number | null;
    lastSyncedAt: string | null;
    pendingCount: number;
    failedCount: number;
  };
} {
  const result = object(value);
  if (result.connection === null) return { connection: null };
  const row = object(result.connection);
  if (
    !["connected", "reconnect", "disconnecting", "disconnected"].includes(
      String(row.status),
    ) ||
    typeof row.exportHousehold !== "boolean" ||
    typeof row.exportPrivate !== "boolean" ||
    !(
      row.reminderMinutes === null ||
      (typeof row.reminderMinutes === "number" &&
        Number.isInteger(row.reminderMinutes) &&
        row.reminderMinutes >= 0 &&
        row.reminderMinutes <= 10080)
    ) ||
    !(
      row.lastSyncedAt === null ||
      (typeof row.lastSyncedAt === "string" &&
        Number.isFinite(Date.parse(row.lastSyncedAt)))
    ) ||
    ![row.pendingCount, row.failedCount].every(
      (x) => typeof x === "number" && Number.isSafeInteger(x) && x >= 0,
    )
  )
    throw new Error("invalid status");
  return {
    connection: {
      status: String(row.status),
      exportHousehold: row.exportHousehold,
      exportPrivate: row.exportPrivate,
      reminderMinutes: row.reminderMinutes as number | null,
      lastSyncedAt: row.lastSyncedAt as string | null,
      pendingCount: row.pendingCount as number,
      failedCount: row.failedCount as number,
    },
  };
}
export function ready(config: CalendarConfig): boolean {
  try {
    const app = new URL(config.appUrl);
    const callback = new URL(config.redirectUri);
    return (
      config.enabled &&
      app.protocol === "https:" &&
      callback.protocol === "https:" &&
      app.username === "" &&
      app.password === "" &&
      callback.username === "" &&
      callback.password === "" &&
      !!config.clientId &&
      !!config.clientSecret &&
      /^[A-Za-z0-9+/_-]{43}=?$/.test(config.encryptionKey)
    );
  } catch {
    return false;
  }
}
export function createCalendarHandler(deps: CalendarServiceDependencies) {
  const provider = deps.provider ?? new GoogleCalendarProvider();
  const origin = (() => {
    try {
      return new URL(deps.config.appUrl).origin;
    } catch {
      return "";
    }
  })();
  function response(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "access-control-allow-origin": origin,
        "access-control-allow-headers":
          "authorization, apikey, content-type, x-client-info",
        "access-control-allow-methods": "POST, OPTIONS",
        vary: "Origin",
      },
    });
  }
  function callbackResult(
    result: "pending" | "error" | "denied",
    ticket?: string,
  ) {
    const url = new URL(deps.config.appUrl);
    url.searchParams.set("google_calendar", result);
    if (ticket) url.searchParams.set("google_calendar_ticket", ticket);
    url.hash = "configuracoes";
    return new Response(null, {
      status: 303,
      headers: {
        location: url.toString(),
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
    });
  }
  return async (request: Request): Promise<Response> => {
    if (request.method === "GET") {
      if (!ready(deps.config))
        return response({ error: "Integração indisponível." }, 503);
      const query = new URL(request.url).searchParams;
      const state = query.get("state");
      if (
        !state ||
        !/^[A-Za-z0-9_-]{43}$/.test(state) ||
        query.getAll("state").length !== 1
      )
        return callbackResult("error");
      try {
        const stateHash = await hashSecret(state);
        // Consume before exchanging the code: expired states and callback replay cannot connect accounts.
        const pending = object(
          await deps.rpc("gc_consume_oauth", { state_hash: stateHash }),
        );
        if (
          !uuidPattern.test(String(pending.user_id)) ||
          !uuidPattern.test(String(pending.household_id)) ||
          typeof pending.verifier_cipher !== "string"
        )
          throw new Error("invalid state");
        if (query.has("error")) return callbackResult("denied");
        const code = query.get("code");
        if (!code || code.length > 4096 || query.getAll("code").length !== 1)
          throw new Error("invalid code");
        const decoded = object(
          await unseal(
            pending.verifier_cipher,
            deps.config.encryptionKey,
            stateHash,
          ),
        );
        if (
          typeof decoded.verifier !== "string" ||
          !/^[A-Za-z0-9_-]{43}$/.test(decoded.verifier)
        )
          throw new Error("invalid verifier");
        const preferences = parsePreferences(pending.preferences);
        const tokens = await provider.exchange(
          deps.config.clientId,
          deps.config.clientSecret,
          deps.config.redirectUri,
          code,
          decoded.verifier,
        );
        const targets = await deps.rpc("gc_oauth_target_ids", {
          actor: pending.user_id,
        });
        if (
          !Array.isArray(targets) ||
          targets.some(
            (id) => typeof id !== "string" || !id || id.length > 1024,
          ) ||
          targets.length > 2
        )
          throw new Error("invalid targets");
        for (const id of targets)
          await provider.verifyCalendar(tokens.accessToken, id);
        const cipher = await seal(
          tokens,
          deps.config.encryptionKey,
          `${pending.user_id}:${pending.household_id}`,
        );
        const ticket = randomSecret();
        await deps.rpc("gc_stage_oauth", {
          actor: pending.user_id,
          household: pending.household_id,
          token_cipher: cipher,
          scopes: [CALENDAR_SCOPE],
          preferences,
          ticket_hash: await hashSecret(ticket),
        });
        return callbackResult("pending", ticket);
      } catch {
        return callbackResult("error");
      }
    }
    if (!origin || request.headers.get("origin") !== origin)
      return response({ error: "Origem não autorizada." }, 403);
    if (request.method === "OPTIONS") return response(null, 200);
    if (request.method !== "POST")
      return response({ error: "Método não permitido." }, 405);
    const authorization = request.headers.get("authorization");
    if (!authorization || !/^Bearer \S+$/.test(authorization))
      return response({ error: "Sessão inválida." }, 401);
    let actor: string | null;
    try {
      actor = await deps.authenticate(authorization);
    } catch {
      actor = null;
    }
    if (!actor || !uuidPattern.test(actor))
      return response({ error: "Sessão inválida." }, 401);
    let body: Record<string, unknown>;
    try {
      const text = await request.text();
      if (text.length > 8192)
        return response({ error: "Requisição muito grande." }, 413);
      body = object(JSON.parse(text));
    } catch {
      return response({ error: "Dados inválidos." }, 400);
    }
    const allowed =
      body.action === "connect" || body.action === "preferences"
        ? [
            "action",
            "exportHousehold",
            "exportPrivate",
            "reminderMinutes",
            "importUpcoming",
          ]
        : body.action === "disconnect"
          ? ["action", "removeEvents"]
          : body.action === "complete"
            ? ["action", "ticket"]
            : body.action === "repair"
              ? ["action", "confirmCreateNewCalendars"]
              : ["action"];
    if (Object.keys(body).some((key) => !allowed.includes(key)))
      return response({ error: "Dados inválidos." }, 400);
    if (!ready(deps.config))
      return body.action === "status"
        ? response({ enabled: false, connection: null })
        : response({ error: "Integração ainda não configurada." }, 503);
    try {
      if (body.action === "repair") {
        if (body.confirmCreateNewCalendars !== true)
          return response(
            {
              error:
                "Confirme a criação de novos calendários para reparar a conexão.",
            },
            400,
          );
        await deps.rpc("gc_repair_targets", { actor });
        return response({ ok: true });
      }
      if (body.action === "complete") {
        if (
          typeof body.ticket !== "string" ||
          !/^[A-Za-z0-9_-]{43}$/.test(body.ticket)
        )
          return response({ error: "Dados inválidos." }, 400);
        await deps.rpc("gc_complete_oauth", {
          actor,
          ticket_hash: await hashSecret(body.ticket),
        });
        return response({ ok: true });
      }
      if (body.action === "status") {
        const result = sanitizeStatus(await deps.rpc("gc_status", { actor }));
        return response({ enabled: true, ...result });
      }
      if (body.action === "connect") {
        const preferences = parsePreferences(body);
        const state = randomSecret();
        const verifier = randomSecret();
        const stateHash = await hashSecret(state);
        await deps.rpc("gc_begin_oauth", {
          actor,
          state_hash: stateHash,
          verifier_cipher: await seal(
            { verifier },
            deps.config.encryptionKey,
            stateHash,
          ),
          preferences,
        });
        return response({
          authorizationUrl: authorizationUrl(
            deps.config.clientId,
            deps.config.redirectUri,
            state,
            await hashSecret(verifier),
          ),
        });
      }
      if (body.action === "preferences") {
        const preferences = parsePreferences(body);
        await deps.rpc("gc_preferences", { actor, preferences });
        return response({ ok: true });
      }
      if (body.action === "sync") {
        await deps.rpc("gc_request_sync", { actor });
        return response({ ok: true });
      }
      if (
        body.action === "disconnect" &&
        typeof body.removeEvents === "boolean"
      ) {
        await deps.rpc("gc_disconnect", {
          actor,
          remove_events: body.removeEvents,
        });
        return response({ ok: true });
      }
      return response({ error: "Dados inválidos." }, 400);
    } catch {
      return response(
        {
          error:
            "Não foi possível concluir a operação no Google Agenda. Tente novamente.",
        },
        400,
      );
    }
  };
}
