import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseReadItem,
  readGoogleItems,
  safeGoogleLink,
  GOOGLE_READ_SCOPES,
} from "./google-reading.ts";
import {
  authorizationUrl,
  CALENDAR_SCOPE,
  GoogleCalendarProvider,
  seal,
} from "./google-calendar-provider.ts";
import {
  createCalendarHandler,
  type CalendarServiceDependencies,
} from "./google-calendar-service.ts";
const actor = "10000000-0000-4000-8000-000000000001",
  house = "20000000-0000-4000-8000-000000000001",
  generation = "30000000-0000-4000-8000-000000000001";
const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(4)));
const config = {
  enabled: true,
  readingEnabled: true,
  appUrl: "https://synthetic.example.test",
  redirectUri: "https://synthetic.example.test/oauth",
  clientId: "synthetic",
  clientSecret: "synthetic",
  encryptionKey: key,
};
test("OAuth reading requires explicit scope selection and does not broaden legacy authorization", () => {
  assert.equal(
    new URL(
      authorizationUrl("c", config.redirectUri, "s", "v"),
    ).searchParams.get("scope"),
    CALENDAR_SCOPE,
  );
  for (const scope of GOOGLE_READ_SCOPES)
    assert.ok(
      new URL(
        authorizationUrl("c", config.redirectUri, "s", "v", [
          CALENDAR_SCOPE,
          ...GOOGLE_READ_SCOPES,
        ]),
      ).searchParams
        .get("scope")!
        .includes(scope),
    );
});
test("civil dates remain date-only and untrusted navigation links are dropped", () => {
  const item = parseReadItem(
    {
      id: "one",
      title: "Synthetic",
      status: "needsAction",
      due: "2026-11-02T00:00:00Z",
      webViewLink: "javascript:alert(1)",
    },
    "google_tasks",
    "list",
    "Fictícia",
    generation,
  )!;
  assert.equal(item.date, "2026-11-02");
  assert.equal(item.startsAt, null);
  assert.equal(item.url, null);
  assert.equal(safeGoogleLink("https://tasks.google.com.evil.test/"), null);
  assert.equal(safeGoogleLink("https://user:password@tasks.google.com/"), null);
});
test("event intervals require compatible start/end and exclusive all-day dates", () => {
  assert.throws(() =>
    parseReadItem(
      { id: "one", start: { date: "2026-11-02" }, end: { date: "2026-11-02" } },
      "google_calendar",
      "cal",
      "Fictícia",
      generation,
    ),
  );
  assert.throws(() =>
    parseReadItem(
      {
        id: "one",
        start: { dateTime: "2026-11-02T12:00:00Z" },
        end: { date: "2026-11-03" },
      },
      "google_calendar",
      "cal",
      "Fictícia",
      generation,
    ),
  );
});
test("disabled reading never obtains credentials", async () => {
  const deps: CalendarServiceDependencies = {
    config: { ...config, readingEnabled: false },
    rpc: async () => {
      throw new Error("must not call");
    },
    authenticate: async () => actor,
  };
  assert.equal(
    (await readGoogleItems(deps, actor, "2026-11")).state,
    "disabled",
  );
});

test("bounded reading resumes with an opaque cursor tied to actor, generation and month", async () => {
  const cipher = await seal(
    {
      accessToken: "synthetic",
      refreshToken: "synthetic",
      expiresAt: Date.now() + 3600000,
    },
    key,
    `${actor}:${house}`,
  );
  const context = {
    state: "connected",
    connectionId: "40000000-0000-4000-8000-000000000001",
    generation,
    userId: actor,
    householdId: house,
    tokenCipher: cipher,
    links: [],
    annotations: [],
  };
  const provider = new GoogleCalendarProvider(async (input) => {
    const u = new URL(String(input));
    if (u.pathname.endsWith("/users/@me/lists"))
      return new Response(
        JSON.stringify({ items: [{ id: "list", title: "Fictícia" }] }),
      );
    if (u.pathname.endsWith("/calendarList"))
      return new Response('{"items":[]}');
    const page = Number(u.searchParams.get("pageToken") || "1");
    return new Response(
      JSON.stringify({
        items: [
          { id: String(page), title: "Synthetic", status: "needsAction" },
        ],
        ...(page < 20 ? { nextPageToken: String(page + 1) } : {}),
      }),
    );
  });
  const deps: CalendarServiceDependencies = {
    config,
    provider,
    authenticate: async () => actor,
    rpc: async () => context,
  };
  const first = await readGoogleItems(deps, actor, "2026-11");
  assert.equal(first.tasksState, "partial");
  assert.ok(first.continuation);
  const second = await readGoogleItems(
    deps,
    actor,
    "2026-11",
    first.continuation!,
  );
  assert.equal(second.tasksState, "ok");
  assert.equal(first.items.length + second.items.length, 20);
  assert.equal(second.continuation, null);
  await assert.rejects(() =>
    readGoogleItems(deps, actor, "2026-12", first.continuation!),
  );
});

test("partial OAuth grant cannot authorize reading", async () => {
  const provider = new GoogleCalendarProvider(
    async () =>
      new Response(
        JSON.stringify({
          access_token: "synthetic",
          refresh_token: "synthetic",
          expires_in: 3600,
          scope: CALENDAR_SCOPE,
        }),
      ),
  );
  await assert.rejects(() =>
    provider.exchange(
      "synthetic",
      "synthetic",
      config.redirectUri,
      "synthetic",
      "synthetic",
      [CALENDAR_SCOPE, ...GOOGLE_READ_SCOPES],
    ),
  );
});
test("reading paginates, suppresses only known exported ids and keeps source failures independent", async () => {
  const cipher = await seal(
    {
      accessToken: "synthetic",
      refreshToken: "synthetic",
      expiresAt: Date.now() + 3600000,
    },
    key,
    `${actor}:${house}`,
  );
  const context = {
    state: "connected",
    connectionId: "40000000-0000-4000-8000-000000000001",
    generation,
    userId: actor,
    householdId: house,
    tokenCipher: cipher,
    links: [
      { calendarId: "cal", eventId: "known" },
      { calendarId: "list", eventId: "one", provider: "google_tasks" },
    ],
    annotations: [],
  };
  let taskCalls = 0;
  const provider = new GoogleCalendarProvider(async (input) => {
    const u = new URL(String(input));
    let data: unknown;
    if (u.pathname.endsWith("/users/@me/lists"))
      data = { items: [{ id: "list", title: "Fictícia" }] };
    else if (u.pathname.endsWith("/tasks")) {
      taskCalls++;
      data = {
        items: [
          {
            id: taskCalls === 1 ? "one" : "two",
            title: "Synthetic",
            status: "needsAction",
          },
        ],
        ...(taskCalls === 1 ? { nextPageToken: "next" } : {}),
      };
    } else if (u.pathname.endsWith("/calendarList"))
      data = {
        items: [
          { id: "bad", summary: "Sem acesso fictício" },
          { id: "cal", summary: "Fictícia" },
        ],
      };
    else if (u.pathname.includes("/calendars/bad/"))
      return new Response("{}", { status: 403 });
    else
      data = {
        items: [
          {
            id: "known",
            summary: "Managed",
            start: { date: "2026-11-02" },
            end: { date: "2026-11-03" },
          },
          {
            id: "other",
            summary: "Independent",
            start: { date: "2026-11-02" },
            end: { date: "2026-11-03" },
          },
        ],
      };
    return new Response(JSON.stringify(data));
  });
  const deps: CalendarServiceDependencies = {
    config,
    authenticate: async () => actor,
    provider,
    rpc: async () => context,
  };
  const result = await readGoogleItems(deps, actor, "2026-11");
  assert.equal(taskCalls, 2);
  assert.equal(result.items.length, 2);
  assert.ok(!result.items.some((i) => i.remoteId === "one"));
  assert.ok(result.items.some((i) => i.remoteId === "other"));
  assert.ok(!result.items.some((i) => i.remoteId === "known"));
  assert.equal(result.tasksState, "ok");
  assert.equal(result.calendarState, "partial");
});
test("revoked generation during fetch discards all returned content", async () => {
  const cipher = await seal(
    {
      accessToken: "synthetic",
      refreshToken: "synthetic",
      expiresAt: Date.now() + 3600000,
    },
    key,
    `${actor}:${house}`,
  );
  let reads = 0;
  const result = await readGoogleItems(
    {
      config,
      authenticate: async () => actor,
      provider: new GoogleCalendarProvider(
        async () => new Response('{"items":[]}'),
      ),
      rpc: async () =>
        ++reads === 1
          ? {
              state: "connected",
              connectionId: "40000000-0000-4000-8000-000000000001",
              generation,
              userId: actor,
              householdId: house,
              tokenCipher: cipher,
              links: [],
              annotations: [],
            }
          : { state: "reconnect" },
    },
    actor,
    "2026-11",
  );
  assert.equal(result.state, "reconnect");
  assert.deepEqual(result.items, []);
});
test("read handler rejects caller-supplied identity and unapproved reading scopes", async () => {
  const calls: string[] = [];
  const handler = createCalendarHandler({
    config: { ...config, readingEnabled: false },
    authenticate: async () => actor,
    rpc: async (name) => {
      calls.push(name);
      return {};
    },
  });
  const response = await handler(
    new Request(config.appUrl, {
      method: "POST",
      headers: {
        origin: config.appUrl,
        authorization: "Bearer synthetic",
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "read", month: "2026-11", actor }),
    }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(calls, []);
  const connect = await handler(
    new Request(config.appUrl, {
      method: "POST",
      headers: {
        origin: config.appUrl,
        authorization: "Bearer synthetic",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "connect",
        exportHousehold: true,
        exportPrivate: false,
        reminderMinutes: null,
        importUpcoming: false,
        readSources: true,
      }),
    }),
  );
  assert.equal(connect.status, 400);
  assert.deepEqual(calls, []);
});
