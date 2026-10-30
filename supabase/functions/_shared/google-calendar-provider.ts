export const CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.app.created";
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_URL = "https://www.googleapis.com/calendar/v3";
export type CalendarPreferences = {
  exportHousehold: boolean;
  exportPrivate: boolean;
  reminderMinutes: number | null;
  importUpcoming: boolean;
};
export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};
export type TaskProjection = {
  id: string;
  title: string;
  dueAt: string;
  status: string;
  version: number;
};
export class ProviderError extends Error {
  constructor(
    readonly code:
      | "reconnect"
      | "rate_limited"
      | "conflict"
      | "not_found"
      | "unavailable"
      | "invalid_response"
      | "calendar_creation_uncertain"
      | "remote_event_deleted"
      | "remote_calendar_deleted",
    readonly retryable = false,
  ) {
    super(code);
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ProviderError("invalid_response");
  return value as Record<string, unknown>;
}
export function parsePreferences(value: unknown): CalendarPreferences {
  const item = record(value);
  if (
    typeof item.exportHousehold !== "boolean" ||
    typeof item.exportPrivate !== "boolean" ||
    !(
      item.reminderMinutes === null ||
      (typeof item.reminderMinutes === "number" &&
        Number.isInteger(item.reminderMinutes) &&
        item.reminderMinutes >= 0 &&
        item.reminderMinutes <= 10080)
    ) ||
    (item.importUpcoming !== undefined &&
      typeof item.importUpcoming !== "boolean")
  )
    throw new ProviderError("invalid_response");
  return {
    exportHousehold: item.exportHousehold,
    exportPrivate: item.exportPrivate,
    reminderMinutes: item.reminderMinutes as number | null,
    importUpcoming: item.importUpcoming === true,
  };
}
export function parseTokens(
  value: unknown,
  previousRefresh?: string,
): StoredTokens {
  const token = record(value);
  if (
    typeof token.access_token !== "string" ||
    token.access_token.length < 1 ||
    typeof token.expires_in !== "number" ||
    !Number.isFinite(token.expires_in) ||
    token.expires_in <= 0 ||
    token.expires_in > 86400
  )
    throw new ProviderError("invalid_response");
  const refreshToken =
    typeof token.refresh_token === "string"
      ? token.refresh_token
      : previousRefresh;
  if (!refreshToken) throw new ProviderError("reconnect");
  if (
    typeof token.scope === "string" &&
    !token.scope.split(" ").includes(CALENDAR_SCOPE)
  )
    throw new ProviderError("reconnect");
  return {
    accessToken: token.access_token,
    refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
}
export function parseStoredTokens(value: unknown): StoredTokens {
  const v = record(value);
  if (
    typeof v.accessToken !== "string" ||
    !v.accessToken ||
    typeof v.refreshToken !== "string" ||
    !v.refreshToken ||
    typeof v.expiresAt !== "number" ||
    !Number.isFinite(v.expiresAt)
  )
    throw new ProviderError("invalid_response");
  return v as StoredTokens;
}
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (x) => x.charCodeAt(0),
  );
}
export function randomSecret(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}
export async function hashSecret(value: string): Promise<string> {
  return base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
}
export async function seal(
  value: unknown,
  keyBase64: string,
  context: string,
): Promise<string> {
  const raw = decode(keyBase64);
  if (raw.length !== 32) throw new Error("invalid encryption configuration");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(context) },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return `v1.${base64url(iv)}.${base64url(new Uint8Array(ciphertext))}`;
}
export async function unseal(
  value: string,
  keyBase64: string,
  context: string,
): Promise<unknown> {
  const [version, iv, ciphertext, extra] = value.split(".");
  if (version !== "v1" || !iv || !ciphertext || extra)
    throw new Error("invalid encrypted envelope");
  const raw = decode(keyBase64);
  if (raw.length !== 32) throw new Error("invalid encryption configuration");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "decrypt",
  ]);
  const decoded = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decode(iv),
      additionalData: new TextEncoder().encode(context),
    },
    key,
    decode(ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(decoded));
}
export function authorizationUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  challenge: string,
): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: CALENDAR_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
  }).toString();
  return url.toString();
}
export function projectTask(
  task: TaskProjection,
  reminderMinutes: number | null,
  appUrl: string,
  now = Date.now(),
) {
  if (
    !/^[0-9a-f-]{36}$/i.test(task.id) ||
    !task.title.trim() ||
    task.title.length > 240 ||
    !["open", "in_progress", "completed"].includes(task.status) ||
    !Number.isFinite(Date.parse(task.dueAt))
  )
    throw new ProviderError("invalid_response");
  const complete = task.status === "completed";
  const shouldRemind =
    !complete &&
    reminderMinutes !== null &&
    Date.parse(task.dueAt) - reminderMinutes * 60_000 > now;
  return {
    summary: `${complete ? "Concluída: " : ""}${task.title}`,
    description: `Prazo da tarefa no Gabio. Gerencie esta tarefa pelo aplicativo: ${new URL("/#tarefas", appUrl)}`,
    start: {
      dateTime: new Date(task.dueAt).toISOString(),
      timeZone: "America/Bahia",
    },
    end: {
      dateTime: new Date(Date.parse(task.dueAt) + 15 * 60_000).toISOString(),
      timeZone: "America/Bahia",
    },
    transparency: "transparent",
    visibility: "private",
    reminders: {
      useDefault: false,
      overrides: shouldRemind
        ? [{ method: "popup", minutes: reminderMinutes }]
        : [],
    },
    extendedProperties: {
      private: { gabioTaskId: task.id, gabioVersion: String(task.version) },
    },
  };
}
export class GoogleCalendarProvider {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  async request(url: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      return await this.fetcher(url, {
        ...init,
        signal: controller.signal,
        redirect: "error",
      });
    } catch {
      throw new ProviderError("unavailable", true);
    } finally {
      clearTimeout(timeout);
    }
  }
  private async json(response: Response): Promise<Record<string, unknown>> {
    if (!response.ok) {
      if (response.status === 401) throw new ProviderError("reconnect");
      if (response.status === 403) {
        try {
          const body = record(await response.json());
          const error = record(body.error);
          const reasons = Array.isArray(error.errors) ? error.errors : [];
          if (
            reasons.some(
              (value) =>
                value &&
                typeof value === "object" &&
                [
                  "rateLimitExceeded",
                  "userRateLimitExceeded",
                  "quotaExceeded",
                  "dailyLimitExceeded",
                ].includes(String((value as Record<string, unknown>).reason)),
            )
          )
            throw new ProviderError("rate_limited", true);
        } catch (error) {
          if (error instanceof ProviderError && error.code === "rate_limited")
            throw error;
        }
      }
      if (response.status === 404 || response.status === 410)
        throw new ProviderError("not_found");
      if (response.status === 409 || response.status === 412)
        throw new ProviderError("conflict");
      if (response.status === 429 || response.status >= 500)
        throw new ProviderError("rate_limited", true);
      throw new ProviderError("unavailable");
    }
    try {
      return record(await response.json());
    } catch {
      throw new ProviderError("invalid_response");
    }
  }
  async exchange(
    clientId: string,
    clientSecret: string,
    redirectUri: string,
    code: string,
    verifier: string,
  ): Promise<StoredTokens> {
    const response = await this.request(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
      }),
    });
    if (response.status === 400) throw new ProviderError("reconnect");
    const data = await this.json(response);
    if (
      typeof data.scope !== "string" ||
      !data.scope.split(" ").includes(CALENDAR_SCOPE)
    )
      throw new ProviderError("reconnect");
    return parseTokens(data);
  }
  async refresh(
    clientId: string,
    clientSecret: string,
    previous: StoredTokens,
  ): Promise<StoredTokens> {
    const response = await this.request(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: previous.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (response.status === 400) throw new ProviderError("reconnect");
    return parseTokens(await this.json(response), previous.refreshToken);
  }
  async verifyCalendar(accessToken: string, calendarId: string): Promise<void> {
    const data = await this.json(
      await this.request(
        `${CALENDAR_URL}/calendars/${encodeURIComponent(calendarId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      ),
    );
    if (data.id !== calendarId) throw new ProviderError("invalid_response");
  }
  async createCalendar(
    accessToken: string,
    kind: "household" | "private",
  ): Promise<string> {
    // An ambiguous insert must not be retried automatically: calendars.insert has no client ID.
    let response: Response;
    try {
      response = await this.request(`${CALENDAR_URL}/calendars`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          summary: kind === "household" ? "Gabio - Casa" : "Gabio - Privado",
          timeZone: "America/Bahia",
        }),
      });
    } catch {
      throw new ProviderError("calendar_creation_uncertain");
    }
    if (response.status >= 500)
      throw new ProviderError("calendar_creation_uncertain");
    const result = await this.json(response);
    if (typeof result.id !== "string" || !result.id)
      throw new ProviderError("calendar_creation_uncertain");
    return result.id;
  }
  async putEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    event: ReturnType<typeof projectTask>,
    etag: string | null,
  ): Promise<string> {
    const endpoint = `${CALENDAR_URL}/calendars/${encodeURIComponent(calendarId)}/events`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    };
    let response = await this.request(
      etag ? `${endpoint}/${encodeURIComponent(eventId)}` : endpoint,
      {
        method: etag ? "PUT" : "POST",
        headers: { ...headers, ...(etag ? { "If-Match": etag } : {}) },
        body: JSON.stringify({ ...event, id: eventId }),
      },
    );
    if (response.status === 409 || response.status === 412) {
      const existing = await this.json(
        await this.request(`${endpoint}/${encodeURIComponent(eventId)}`, {
          headers,
        }),
      );
      const properties = record(existing.extendedProperties);
      const privateProperties = record(properties.private);
      if (
        privateProperties.gabioTaskId !==
          event.extendedProperties.private.gabioTaskId ||
        typeof existing.etag !== "string"
      )
        throw new ProviderError("conflict");
      const storedVersion = Number(privateProperties.gabioVersion);
      if (
        Number.isSafeInteger(storedVersion) &&
        storedVersion > Number(event.extendedProperties.private.gabioVersion)
      )
        throw new ProviderError("conflict");
      response = await this.request(
        `${endpoint}/${encodeURIComponent(eventId)}`,
        {
          method: "PUT",
          headers: { ...headers, "If-Match": existing.etag },
          body: JSON.stringify({ ...event, id: eventId }),
        },
      );
    }
    const result = await this.json(response);
    if (result.id !== eventId || typeof result.etag !== "string")
      throw new ProviderError("invalid_response");
    return result.etag;
  }
  async removeEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
  ): Promise<void> {
    const response = await this.request(
      `${CALENDAR_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if ([204, 404, 410].includes(response.status)) return;
    await this.json(response);
  }
  async revoke(refreshToken: string): Promise<void> {
    const response = await this.request(
      "https://oauth2.googleapis.com/revoke",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refreshToken }),
      },
    );
    if (response.ok || response.status === 400) return;
    throw new ProviderError("unavailable", true);
  }
}
