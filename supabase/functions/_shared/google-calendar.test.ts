import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CALENDAR_SCOPE,
  GoogleCalendarProvider,
  ProviderError,
  authorizationUrl,
  hashSecret,
  parsePreferences,
  parseTokens,
  projectTask,
  randomSecret,
  seal,
  unseal,
} from "./google-calendar-provider.ts";
import { createCalendarHandler } from "./google-calendar-service.ts";
import { createCalendarWorker } from "./google-calendar-worker.ts";
const user = "11111111-1111-4111-8111-111111111111";
const house = "22222222-2222-4222-8222-222222222222";
const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const config = {
  enabled: true,
  appUrl: "https://app.example.test",
  redirectUri: "https://backend.example.test/functions/v1/google-calendar",
  clientId: "synthetic-client",
  clientSecret: "synthetic-secret",
  encryptionKey: key,
};
const prefs = {
  exportHousehold: true,
  exportPrivate: true,
  reminderMinutes: 15,
  importUpcoming: true,
};
const task = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Tarefa sintética",
  dueAt: "2099-04-20T15:00:00Z",
  status: "open",
  version: 1,
};
function post(body: unknown, authorization = "Bearer synthetic") {
  return new Request(
    "https://backend.example.test/functions/v1/google-calendar",
    {
      method: "POST",
      headers: {
        origin: config.appUrl,
        authorization,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}
test("authorization only requests app calendars with offline PKCE and no login replacement", () => {
  const url = new URL(
    authorizationUrl("client", config.redirectUri, "state", "challenge"),
  );
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("scope"), CALENDAR_SCOPE);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("include_granted_scopes"), "false");
});
test("encrypted token envelopes are bound to account and household and use fresh IV", async () => {
  const first = await seal({ secret: "synthetic" }, key, `${user}:${house}`);
  const second = await seal({ secret: "synthetic" }, key, `${user}:${house}`);
  assert.notEqual(first, second);
  assert.deepEqual(await unseal(first, key, `${user}:${house}`), {
    secret: "synthetic",
  });
  await assert.rejects(unseal(first, key, "another-account"));
});
test("tampered envelopes cannot be decrypted", async () => {
  const cipher = await seal({ value: 1 }, key, "context");
  await assert.rejects(unseal(cipher.replace("v1.", "v2."), key, "context"));
});
test("preferences reject invalid reminder and nonboolean visibility", () => {
  assert.throws(() => parsePreferences({ ...prefs, reminderMinutes: -1 }));
  assert.throws(() => parsePreferences({ ...prefs, exportPrivate: "true" }));
});
test("token parsing requires usable expiry and refresh token", () => {
  assert.throws(() =>
    parseTokens({ access_token: "synthetic", expires_in: 3600 }),
  );
  assert.throws(() =>
    parseTokens({
      access_token: "synthetic",
      refresh_token: "synthetic",
      expires_in: 0,
    }),
  );
  assert.equal(
    parseTokens({ access_token: "synthetic", expires_in: 3600 }, "previous")
      .refreshToken,
    "previous",
  );
});
test("task deadlines remain transparent, keep instant, and do not become recurring series", () => {
  const projected = projectTask(task, 15, config.appUrl, 0);
  assert.equal(projected.transparency, "transparent");
  assert.equal(projected.start.dateTime, "2099-04-20T15:00:00.000Z");
  assert.equal(projected.end.dateTime, "2099-04-20T15:15:00.000Z");
  assert.equal("recurrence" in projected, false);
  assert.equal(projected.reminders.overrides.length, 1);
  assert.equal(projected.visibility, "private");
});
test("completed and expired tasks never create retroactive reminders", () => {
  assert.equal(
    projectTask({ ...task, status: "completed" }, 15, config.appUrl, 0)
      .reminders.overrides.length,
    0,
  );
  assert.equal(
    projectTask(task, 15, config.appUrl, Date.parse(task.dueAt)).reminders
      .overrides.length,
    0,
  );
});
test("retry after ambiguous insertion reuses event ID and verifies managed ownership", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const responses = [
    new Response(null, { status: 409 }),
    Response.json({
      etag: "v1",
      extendedProperties: { private: { gabioTaskId: task.id } },
    }),
    Response.json({ id: "abcde123", etag: "v2" }),
  ];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return responses.shift()!;
  };
  const provider = new GoogleCalendarProvider(fetcher);
  const etag = await provider.putEvent(
    "synthetic",
    "calendar",
    "abcde123",
    projectTask(task, null, config.appUrl),
    null,
  );
  assert.equal(etag, "v2");
  assert.equal(calls.length, 3);
  assert.equal(calls[2]?.init?.method, "PUT");
  assert.equal(
    (calls[2]?.init?.headers as Record<string, string>)["If-Match"],
    "v1",
  );
});
test("event collision cannot overwrite another app resource", async () => {
  let n = 0;
  const provider = new GoogleCalendarProvider(async () =>
    ++n === 1
      ? new Response(null, { status: 409 })
      : Response.json({
          etag: "v1",
          extendedProperties: { private: { gabioTaskId: "other" } },
        }),
  );
  await assert.rejects(
    provider.putEvent(
      "synthetic",
      "calendar",
      "abcde123",
      projectTask(task, null, config.appUrl),
      null,
    ),
    (error: unknown) =>
      error instanceof ProviderError && error.code === "conflict",
  );
  assert.equal(n, 2);
});
test("calendar insertion timeout is terminal uncertainty rather than blind retry", async () => {
  const provider = new GoogleCalendarProvider(async () => {
    throw new Error("network timeout");
  });
  await assert.rejects(
    provider.createCalendar("synthetic", "private"),
    (error: unknown) =>
      error instanceof ProviderError &&
      error.code === "calendar_creation_uncertain" &&
      !error.retryable,
  );
});
test("deleting an already absent event is idempotent", async () => {
  const provider = new GoogleCalendarProvider(
    async () => new Response(null, { status: 410 }),
  );
  await provider.removeEvent("synthetic", "calendar", "abcde123");
});
test("refresh invalid_grant asks for reconnection", async () => {
  const provider = new GoogleCalendarProvider(
    async () => new Response(null, { status: 400 }),
  );
  await assert.rejects(
    provider.refresh("client", "secret", {
      accessToken: "a",
      refreshToken: "r",
      expiresAt: 0,
    }),
    (error: unknown) =>
      error instanceof ProviderError && error.code === "reconnect",
  );
});
test("disabled integration requires user session and performs no privileged RPC", async () => {
  let calls = 0;
  const handler = createCalendarHandler({
    config: { ...config, enabled: false },
    authenticate: async () => user,
    rpc: async () => {
      calls++;
    },
  });
  assert.deepEqual(await (await handler(post({ action: "status" }))).json(), {
    enabled: false,
    connection: null,
  });
  assert.equal(calls, 0);
  assert.equal(
    (await handler(post({ action: "connect", ...prefs }))).status,
    503,
  );
  const denied = createCalendarHandler({
    config,
    authenticate: async () => null,
    rpc: async () => {
      calls++;
    },
  });
  assert.equal((await denied(post({ action: "status" }))).status, 401);
  assert.equal(calls, 0);
});
test("unapproved origin cannot use authenticated integration", async () => {
  const handler = createCalendarHandler({
    config,
    authenticate: async () => user,
    rpc: async () => {
      throw new Error("must not call");
    },
  });
  const request = new Request("https://backend.example.test", {
    method: "POST",
    headers: {
      origin: "https://attacker.example.test",
      authorization: "Bearer synthetic",
    },
    body: '{"action":"connect"}',
  });
  assert.equal((await handler(request)).status, 403);
});
test("connection stores only state hash and encrypted PKCE verifier", async () => {
  let stored: Record<string, unknown> | undefined;
  const handler = createCalendarHandler({
    config,
    authenticate: async () => user,
    rpc: async (name, args) => {
      assert.equal(name, "gc_begin_oauth");
      stored = args;
      return null;
    },
  });
  const result = await (
    await handler(post({ action: "connect", ...prefs }))
  ).json();
  const url = new URL(result.authorizationUrl);
  const state = url.searchParams.get("state")!;
  assert.equal(stored?.state_hash, await hashSecret(state));
  assert.equal(String(stored?.verifier_cipher).includes(state), false);
  assert.equal(stored?.actor, user);
});
test("callback denial consumes state and replay cannot connect", async () => {
  let uses = 0;
  let finish = 0;
  const handler = createCalendarHandler({
    config,
    authenticate: async () => null,
    rpc: async (name) => {
      if (name === "gc_consume_oauth") {
        uses++;
        if (uses > 1) throw new Error("replay");
        return {
          user_id: user,
          household_id: house,
          verifier_cipher: "not-needed",
          preferences: prefs,
        };
      }
      finish++;
      return null;
    },
  });
  const state = randomSecret();
  const request = () =>
    new Request(`${config.redirectUri}?state=${state}&error=access_denied`);
  const denied = await handler(request());
  assert.match(denied.headers.get("location")!, /google_calendar=denied/);
  const replay = await handler(request());
  assert.match(replay.headers.get("location")!, /google_calendar=error/);
  assert.equal(finish, 0);
});
test("valid callback stages encrypted credentials until authenticated completion", async () => {
  const state = randomSecret();
  const verifier = randomSecret();
  const cipher = await seal({ verifier }, key, await hashSecret(state));
  let finished: Record<string, unknown> | undefined;
  const provider = new GoogleCalendarProvider(async () =>
    Response.json({
      access_token: "synthetic-access",
      refresh_token: "synthetic-refresh",
      expires_in: 3600,
      scope: CALENDAR_SCOPE,
    }),
  );
  const handler = createCalendarHandler({
    config,
    provider,
    authenticate: async () => null,
    rpc: async (name, args) => {
      if (name === "gc_consume_oauth")
        return {
          user_id: user,
          household_id: house,
          verifier_cipher: cipher,
          preferences: prefs,
        };
      if (name === "gc_oauth_target_ids") return [];
      assert.equal(name, "gc_stage_oauth");
      finished = args;
      return null;
    },
  });
  const response = await handler(
    new Request(`${config.redirectUri}?state=${state}&code=synthetic-code`),
  );
  assert.match(
    response.headers.get("location")!,
    /google_calendar=pending&google_calendar_ticket=[A-Za-z0-9_-]{43}#configuracoes/,
  );
  assert.equal(finished?.actor, user);
  const stored = (await unseal(
    String(finished?.token_cipher),
    key,
    `${user}:${house}`,
  )) as { refreshToken: string };
  assert.equal(stored.refreshToken, "synthetic-refresh");
});
test("worker rejects public API keys without touching database", async () => {
  let called = false;
  const worker = createCalendarWorker({
    config,
    workerSecret: "dedicated-".padEnd(43, "x"),
    rpc: async () => {
      called = true;
      return [];
    },
  });
  const result = await worker(
    new Request("https://backend.example.test", {
      method: "POST",
      headers: { authorization: "Bearer sb_publishable_synthetic" },
    }),
  );
  assert.equal(result.status, 401);
  assert.equal(called, false);
});
test("worker does not export a job superseded by a privacy change", async () => {
  const secret = "dedicated-".padEnd(43, "x");
  let providerCalled = false;
  const worker = createCalendarWorker({
    config,
    workerSecret: secret,
    provider: new GoogleCalendarProvider(async () => {
      providerCalled = true;
      throw new Error("must not call");
    }),
    rpc: async (name) =>
      name === "gc_claim_jobs"
        ? [
            {
              jobId: user,
              leaseToken: user,
              connectionId: user,
              userId: user,
              householdId: house,
              tokenCipher: "synthetic-encrypted",
              action: "upsert",
              task,
              calendarId: "calendar",
              targetKind: "household",
              targetState: "ready",
              eventId: "abcde123",
              etag: null,
              reminderMinutes: 15,
              attempts: 1,
            },
          ]
        : null,
  });
  const response = await worker(
    new Request("https://backend.example.test", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(providerCalled, false);
  assert.deepEqual(await response.json(), { processed: 0, failed: 0 });
});
test("pending OAuth completion requires the initiating authenticated actor and is single use", async () => {
  const ticket = randomSecret();
  const hash = await hashSecret(ticket);
  let consumed = false;
  const rpc = async (name: string, args: Record<string, unknown>) => {
    assert.equal(name, "gc_complete_oauth");
    if (args.actor !== user || args.ticket_hash !== hash || consumed)
      throw new Error("invalid ticket");
    consumed = true;
    return null;
  };
  const wrong = createCalendarHandler({
    config,
    authenticate: async () => house,
    rpc,
  });
  assert.equal((await wrong(post({ action: "complete", ticket }))).status, 400);
  assert.equal(consumed, false);
  const correct = createCalendarHandler({
    config,
    authenticate: async () => user,
    rpc,
  });
  assert.equal(
    (await correct(post({ action: "complete", ticket }))).status,
    200,
  );
  assert.equal(consumed, true);
  assert.equal(
    (await correct(post({ action: "complete", ticket }))).status,
    400,
  );
});
test("unexpected identity fields are rejected instead of forwarded", async () => {
  let calls = 0;
  const handler = createCalendarHandler({
    config,
    authenticate: async () => user,
    rpc: async () => {
      calls++;
      return null;
    },
  });
  assert.equal(
    (await handler(post({ action: "connect", ...prefs, actor: house }))).status,
    400,
  );
  assert.equal(calls, 0);
});
test("status responses cannot expose credentials returned by a backend mistake", async () => {
  const handler = createCalendarHandler({
    config,
    authenticate: async () => user,
    rpc: async () => ({
      connection: {
        status: "connected",
        exportHousehold: true,
        exportPrivate: false,
        reminderMinutes: null,
        lastSyncedAt: null,
        pendingCount: 0,
        failedCount: 0,
        tokenCipher: "sensitive-not-returned",
      },
      secret: "not-returned",
    }),
  });
  const response = await handler(post({ action: "status" }));
  assert.equal(response.status, 200);
  assert.equal((await response.text()).includes("not-returned"), false);
});
test("worker creates task event and acknowledges the exact lease", async () => {
  const secret = "dedicated-".padEnd(43, "x");
  const tokenCipher = await seal(
    {
      accessToken: "synthetic-access",
      refreshToken: "synthetic-refresh",
      expiresAt: Date.now() + 3600000,
    },
    key,
    `${user}:${house}`,
  );
  const job = {
    jobId: user,
    leaseToken: user,
    connectionId: user,
    userId: user,
    householdId: house,
    tokenCipher,
    action: "upsert",
    task,
    calendarId: "calendar",
    targetKind: "household",
    targetState: "ready",
    eventId: "abcde123",
    etag: null,
    reminderMinutes: 15,
    attempts: 1,
  };
  let acknowledgement: Record<string, unknown> | undefined;
  const provider = new GoogleCalendarProvider(async (_url, init) => {
    assert.equal(init?.method, "POST");
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.id, job.eventId);
    assert.equal(payload.extendedProperties.private.gabioTaskId, task.id);
    return Response.json({ id: job.eventId, etag: "synthetic-etag" });
  });
  const worker = createCalendarWorker({
    config,
    workerSecret: secret,
    provider,
    rpc: async (name, args) => {
      if (name === "gc_claim_jobs") return [job];
      if (name === "gc_validate_job") return job;
      assert.equal(name, "gc_finish_job");
      acknowledgement = args;
      return null;
    },
  });
  const response = await worker(
    new Request("https://backend.example.test", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    }),
  );
  assert.deepEqual(await response.json(), { processed: 1, failed: 0 });
  assert.equal(acknowledgement?.lease_token, user);
  assert.deepEqual(acknowledgement?.result, {
    status: "synced",
    etag: "synthetic-etag",
  });
});
test("privacy cleanup deletes managed event before acknowledgement", async () => {
  const secret = "dedicated-".padEnd(43, "x");
  const tokenCipher = await seal(
    {
      accessToken: "synthetic-access",
      refreshToken: "synthetic-refresh",
      expiresAt: Date.now() + 3600000,
    },
    key,
    `${user}:${house}`,
  );
  const job = {
    jobId: user,
    leaseToken: user,
    connectionId: user,
    userId: user,
    householdId: house,
    tokenCipher,
    action: "delete",
    task: null,
    calendarId: "calendar",
    targetKind: "household",
    targetState: "ready",
    eventId: "abcde123",
    etag: null,
    reminderMinutes: null,
    attempts: 1,
  };
  let deleted = false;
  const worker = createCalendarWorker({
    config,
    workerSecret: secret,
    provider: new GoogleCalendarProvider(async (_url, init) => {
      assert.equal(init?.method, "DELETE");
      deleted = true;
      return new Response(null, { status: 204 });
    }),
    rpc: async (name, args) => {
      if (name === "gc_claim_jobs") return [job];
      if (name === "gc_validate_job") return job;
      assert.equal(deleted, true);
      assert.deepEqual(args.result, { status: "deleted" });
      return null;
    },
  });
  const response = await worker(
    new Request("https://backend.example.test", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    }),
  );
  assert.deepEqual(await response.json(), { processed: 1, failed: 0 });
});
test("uncertain calendar creation is never automatically repeated", async () => {
  const secret = "dedicated-".padEnd(43, "x");
  const tokenCipher = await seal(
    {
      accessToken: "synthetic-access",
      refreshToken: "synthetic-refresh",
      expiresAt: Date.now() + 3600000,
    },
    key,
    `${user}:${house}`,
  );
  const job = {
    jobId: user,
    leaseToken: user,
    connectionId: user,
    userId: user,
    householdId: house,
    tokenCipher,
    action: "upsert",
    task,
    calendarId: null,
    targetKind: "household",
    targetState: "creating",
    eventId: "abcde123",
    etag: null,
    reminderMinutes: null,
    attempts: 1,
  };
  let providerCalled = false;
  let result: unknown;
  const worker = createCalendarWorker({
    config,
    workerSecret: secret,
    provider: new GoogleCalendarProvider(async () => {
      providerCalled = true;
      throw new Error("must not call");
    }),
    rpc: async (name, args) => {
      if (name === "gc_claim_jobs") return [job];
      if (name === "gc_validate_job") return job;
      result = args.result;
      return null;
    },
  });
  await worker(
    new Request("https://backend.example.test", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    }),
  );
  assert.equal(providerCalled, false);
  assert.deepEqual(result, {
    status: "failed",
    errorCode: "calendar_creation_uncertain",
  });
});
test("callback for another Google account cannot replace existing calendar access", async () => {
  const state = randomSecret();
  const verifier = randomSecret();
  const cipher = await seal({ verifier }, key, await hashSecret(state));
  let staged = false;
  let requests = 0;
  const handler = createCalendarHandler({
    config,
    authenticate: async () => null,
    provider: new GoogleCalendarProvider(async () =>
      ++requests === 1
        ? Response.json({
            access_token: "synthetic-access",
            refresh_token: "synthetic-refresh",
            expires_in: 3600,
            scope: CALENDAR_SCOPE,
          })
        : new Response(null, { status: 404 }),
    ),
    rpc: async (name) => {
      if (name === "gc_consume_oauth")
        return {
          user_id: user,
          household_id: house,
          verifier_cipher: cipher,
          preferences: prefs,
        };
      if (name === "gc_oauth_target_ids") return ["existing-private-calendar"];
      staged = true;
      return null;
    },
  });
  const response = await handler(
    new Request(`${config.redirectUri}?state=${state}&code=synthetic-code`),
  );
  assert.match(response.headers.get("location")!, /google_calendar=error/);
  assert.equal(staged, false);
});
test("outdated projection cannot overwrite a newer remote task version", async () => {
  let calls = 0;
  const provider = new GoogleCalendarProvider(async () =>
    ++calls === 1
      ? new Response(null, { status: 409 })
      : Response.json({
          etag: "newer",
          extendedProperties: {
            private: { gabioTaskId: task.id, gabioVersion: "2" },
          },
        }),
  );
  await assert.rejects(
    provider.putEvent(
      "synthetic",
      "calendar",
      "abcde123",
      projectTask(task, null, config.appUrl),
      null,
    ),
    (error: unknown) =>
      error instanceof ProviderError && error.code === "conflict",
  );
  assert.equal(calls, 2);
});
test("expired etag reconciles only app-owned event using a fresh conditional update", async () => {
  const calls: RequestInit[] = [];
  const responses = [
    new Response(null, { status: 412 }),
    Response.json({
      etag: "changed",
      extendedProperties: {
        private: { gabioTaskId: task.id, gabioVersion: "1" },
      },
    }),
    Response.json({ id: "abcde123", etag: "restored" }),
  ];
  const provider = new GoogleCalendarProvider(async (_url, init) => {
    calls.push(init!);
    return responses.shift()!;
  });
  assert.equal(
    await provider.putEvent(
      "synthetic",
      "calendar",
      "abcde123",
      projectTask(task, null, config.appUrl),
      "previous",
    ),
    "restored",
  );
  assert.equal(
    (calls[2]?.headers as Record<string, string>)["If-Match"],
    "changed",
  );
});
test("Google 403 rate limits use bounded retry rather than terminal failure", async () => {
  const provider = new GoogleCalendarProvider(async () =>
    Response.json(
      { error: { errors: [{ reason: "userRateLimitExceeded" }] } },
      { status: 403 },
    ),
  );
  await assert.rejects(
    provider.putEvent(
      "synthetic",
      "calendar",
      "abcde123",
      projectTask(task, null, config.appUrl),
      null,
    ),
    (error: unknown) =>
      error instanceof ProviderError &&
      error.code === "rate_limited" &&
      error.retryable,
  );
});
test("stale credential refresh uses CAS and never writes an event after lease failure", async () => {
  const secret = "dedicated-".padEnd(43, "x");
  const tokenCipher = await seal(
    { accessToken: "expired", refreshToken: "synthetic-refresh", expiresAt: 0 },
    key,
    `${user}:${house}`,
  );
  const job = {
    jobId: user,
    leaseToken: user,
    connectionId: user,
    userId: user,
    householdId: house,
    tokenCipher,
    action: "upsert",
    task,
    calendarId: "calendar",
    targetKind: "household",
    targetState: "ready",
    eventId: "abcde123",
    etag: null,
    reminderMinutes: null,
    attempts: 1,
  };
  let httpCalls = 0;
  let updateArgs: Record<string, unknown> | undefined;
  const worker = createCalendarWorker({
    config,
    workerSecret: secret,
    provider: new GoogleCalendarProvider(async (url) => {
      httpCalls++;
      assert.equal(String(url), "https://oauth2.googleapis.com/token");
      return Response.json({ access_token: "new-access", expires_in: 3600 });
    }),
    rpc: async (name, args) => {
      if (name === "gc_claim_jobs") return [job];
      if (name === "gc_validate_job") return job;
      if (name === "gc_update_token") {
        updateArgs = args;
        throw new Error("stale lease");
      }
      return null;
    },
  });
  const response = await worker(
    new Request("https://backend.example.test", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    }),
  );
  assert.deepEqual(await response.json(), { processed: 0, failed: 1 });
  assert.equal(httpCalls, 1);
  assert.equal(updateArgs?.previous_cipher, tokenCipher);
  assert.equal(updateArgs?.job_id, user);
  assert.equal(updateArgs?.lease_token, user);
});
test("calendar repair requires explicit confirmation and cannot select another actor", async () => {
  let calls = 0;
  const handler = createCalendarHandler({
    config,
    authenticate: async () => user,
    rpc: async (name, args) => {
      calls++;
      assert.equal(name, "gc_repair_targets");
      assert.deepEqual(args, { actor: user });
      return null;
    },
  });
  assert.equal((await handler(post({ action: "repair" }))).status, 400);
  assert.equal(calls, 0);
  assert.equal(
    (
      await handler(
        post({
          action: "repair",
          confirmCreateNewCalendars: true,
          actor: house,
        }),
      )
    ).status,
    400,
  );
  assert.equal(calls, 0);
  assert.equal(
    (await handler(post({ action: "repair", confirmCreateNewCalendars: true })))
      .status,
    200,
  );
  assert.equal(calls, 1);
});
test("worker revokes the Google grant after database has scheduled cleanup completion", async () => {
  const secret = "dedicated-".padEnd(43, "x");
  const tokenCipher = await seal(
    { accessToken: "expired", refreshToken: "synthetic-refresh", expiresAt: 0 },
    key,
    `${user}:${house}`,
  );
  const job = {
    jobId: user,
    leaseToken: user,
    connectionId: user,
    userId: user,
    householdId: house,
    tokenCipher,
    action: "revoke",
    task: null,
    calendarId: null,
    targetKind: "household",
    targetState: "missing",
    eventId: "grevoke",
    etag: null,
    reminderMinutes: null,
    attempts: 1,
  };
  let revoked = false;
  const worker = createCalendarWorker({
    config,
    workerSecret: secret,
    provider: new GoogleCalendarProvider(async (url, init) => {
      assert.equal(String(url), "https://oauth2.googleapis.com/revoke");
      assert.equal(
        new URLSearchParams(String(init?.body)).get("token"),
        "synthetic-refresh",
      );
      revoked = true;
      return new Response(null, { status: 200 });
    }),
    rpc: async (name, args) => {
      if (name === "gc_claim_jobs") return [job];
      if (name === "gc_validate_job") return job;
      assert.equal(revoked, true);
      assert.deepEqual(args.result, { status: "deleted" });
      return null;
    },
  });
  const response = await worker(
    new Request("https://backend.example.test", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    }),
  );
  assert.deepEqual(await response.json(), { processed: 1, failed: 0 });
});
test("manually deleted Google event rotates through retry after verifying its calendar exists", async () => {
  const secret = "dedicated-".padEnd(43, "x");
  const tokenCipher = await seal(
    {
      accessToken: "synthetic-access",
      refreshToken: "synthetic-refresh",
      expiresAt: Date.now() + 3600000,
    },
    key,
    `${user}:${house}`,
  );
  const job = {
    jobId: user,
    leaseToken: user,
    connectionId: user,
    userId: user,
    householdId: house,
    tokenCipher,
    action: "upsert",
    task,
    calendarId: "calendar",
    targetKind: "household",
    targetState: "ready",
    eventId: "abcde123",
    etag: "previous",
    reminderMinutes: null,
    attempts: 1,
  };
  let result: unknown;
  const calls: string[] = [];
  const worker = createCalendarWorker({
    config,
    workerSecret: secret,
    provider: new GoogleCalendarProvider(async (url) => {
      calls.push(String(url));
      return calls.length === 1
        ? new Response(null, { status: 410 })
        : Response.json({ id: "calendar" });
    }),
    rpc: async (name, args) => {
      if (name === "gc_claim_jobs") return [job];
      if (name === "gc_validate_job") return job;
      result = args.result;
      return null;
    },
  });
  const response = await worker(
    new Request("https://backend.example.test", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    }),
  );
  assert.deepEqual(await response.json(), { processed: 0, failed: 1 });
  assert.deepEqual(result, {
    status: "retry",
    errorCode: "remote_event_deleted",
  });
  assert.equal(
    calls[1],
    "https://www.googleapis.com/calendar/v3/calendars/calendar",
  );
});
test("manually deleted Google calendar is flagged for explicit repair without blind creation", async () => {
  const secret = "dedicated-".padEnd(43, "x");
  const tokenCipher = await seal(
    {
      accessToken: "synthetic-access",
      refreshToken: "synthetic-refresh",
      expiresAt: Date.now() + 3600000,
    },
    key,
    `${user}:${house}`,
  );
  const job = {
    jobId: user,
    leaseToken: user,
    connectionId: user,
    userId: user,
    householdId: house,
    tokenCipher,
    action: "upsert",
    task,
    calendarId: "calendar",
    targetKind: "household",
    targetState: "ready",
    eventId: "abcde123",
    etag: "previous",
    reminderMinutes: null,
    attempts: 1,
  };
  let result: unknown;
  let calls = 0;
  const worker = createCalendarWorker({
    config,
    workerSecret: secret,
    provider: new GoogleCalendarProvider(async (_url, init) => {
      calls++;
      assert.notEqual(init?.method, "POST");
      return new Response(null, { status: 404 });
    }),
    rpc: async (name, args) => {
      if (name === "gc_claim_jobs") return [job];
      if (name === "gc_validate_job") return job;
      result = args.result;
      return null;
    },
  });
  const response = await worker(
    new Request("https://backend.example.test", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    }),
  );
  assert.deepEqual(await response.json(), { processed: 0, failed: 1 });
  assert.deepEqual(result, {
    status: "failed",
    errorCode: "remote_calendar_deleted",
  });
  assert.equal(calls, 2);
});
