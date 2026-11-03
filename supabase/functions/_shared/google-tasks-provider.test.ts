import assert from "node:assert/strict";
import test from "node:test";
import {
  GoogleCalendarProvider,
  ProviderError,
  seal,
  randomSecret,
  hashSecret,
  CALENDAR_SCOPE,
} from "./google-calendar-provider.ts";
import {
  GoogleTasksProvider,
  projectGoogleTask,
  TASKS_SCOPE,
} from "./google-tasks-provider.ts";
import { createCalendarWorker } from "./google-calendar-worker.ts";
import { createCalendarHandler } from "./google-calendar-service.ts";
const user = "a1000000-0000-4000-8000-000000000001";
const house = "a2000000-0000-4000-8000-000000000001";
const id = "a3000000-0000-4000-8000-000000000001";
const marker = "g0123456789abcdef";
const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(3)));
const config = {
  enabled: true,
  tasksWriteEnabled: true,
  appUrl: "https://app.example.test",
  redirectUri: "https://backend.example.test",
  clientId: "synthetic",
  clientSecret: "synthetic",
  encryptionKey: key,
};
const task = {
  id,
  title: "Tarefa sintética",
  dueAt: null,
  status: "open",
  version: 1,
};
const transport = (fetcher: typeof fetch) =>
  new GoogleTasksProvider(new GoogleCalendarProvider(fetcher));
test("Tasks projects an optional civil day in Bahia and does not export private fields", () => {
  const blank = projectGoogleTask(task, marker, config.appUrl);
  assert.equal(blank.due, null);
  assert.equal(blank.status, "needsAction");
  assert.equal(
    projectGoogleTask(
      { ...task, dueAt: "2026-11-04T01:30:00Z" },
      marker,
      config.appUrl,
    ).due,
    "2026-11-03T00:00:00.000Z",
  );
  assert.equal(
    projectGoogleTask({ ...task, status: "completed" }, marker, config.appUrl)
      .status,
    "completed",
  );
  assert.deepEqual(Object.keys(blank).sort(), [
    "completed",
    "due",
    "notes",
    "status",
    "title",
  ]);
});
test("Tasks POST timeout and invalid success identity remain uncertain", async () => {
  for (const response of [
    async () => {
      throw new Error("timeout");
    },
    async () => Response.json({ id: 1 }),
  ]) {
    let calls = 0;
    const api = transport(async () => {
      calls++;
      return response();
    });
    await assert.rejects(
      api.createTask(
        "synthetic",
        "synthetic-list",
        projectGoogleTask(task, marker, config.appUrl),
      ),
      (e: unknown) =>
        e instanceof ProviderError && e.code === "tasks_creation_uncertain",
    );
    assert.equal(calls, 1);
  }
});
test("Tasks update clears removed dates and completed status; delete missing is idempotent", async () => {
  const calls: RequestInit[] = [];
  const api = transport(async (_url, init) => {
    calls.push(init!);
    return init?.method === "DELETE"
      ? new Response(null, { status: 404 })
      : Response.json({ id: "remote" });
  });
  await api.updateTask(
    "synthetic",
    "list",
    "remote",
    projectGoogleTask(task, marker, config.appUrl),
  );
  const body = JSON.parse(String(calls[0]!.body));
  assert.equal(body.due, null);
  assert.equal(body.completed, null);
  assert.equal(calls[0]!.method, "PATCH");
  await api.removeTask("synthetic", "list", "remote");
});
test("Tasks quota rejection retries without asking for reconnection", async () => {
  const api = transport(async () =>
    Response.json(
      { error: { errors: [{ reason: "rateLimitExceeded" }] } },
      { status: 403 },
    ),
  );
  await assert.rejects(
    api.updateTask(
      "synthetic",
      "list",
      "remote",
      projectGoogleTask(task, marker, config.appUrl),
    ),
    (error: unknown) =>
      error instanceof ProviderError &&
      error.code === "rate_limited" &&
      error.retryable,
  );
});
test("ambiguous insertion reconciliation requires one exact marker and complete bounded pages", async () => {
  for (const result of [
    { items: [{ id: "remote", notes: `Gabio: ${marker}` }] },
    { items: [{ id: "other", notes: `prefix Gabio: ${marker}` }] },
    {
      items: [
        { id: "one", notes: `Gabio: ${marker}` },
        { id: "two", notes: `Gabio: ${marker}` },
      ],
    },
  ]) {
    const api = transport(async () => Response.json(result));
    assert.equal(
      await api.findAttempt("synthetic", "list", marker),
      result.items.length === 1 && result.items[0]!.id === "remote"
        ? "remote"
        : null,
    );
  }
  let calls = 0;
  const api = transport(async () => {
    calls++;
    return Response.json({
      items: [{ id: "remote", notes: `Gabio: ${marker}` }],
      nextPageToken: "next",
    });
  });
  assert.equal(await api.findAttempt("synthetic", "list", marker), null);
  assert.equal(calls, 4);
});
async function job() {
  return {
    provider: "google_tasks",
    remoteTaskId: null,
    insertionAttempted: false,
    jobId: id,
    leaseToken: "a4000000-0000-4000-8000-000000000001",
    connectionId: "a5000000-0000-4000-8000-000000000001",
    userId: user,
    householdId: house,
    tokenCipher: await seal(
      {
        accessToken: "synthetic-access",
        refreshToken: "synthetic-refresh",
        expiresAt: Date.now() + 3600000,
      },
      key,
      `${user}:${house}`,
    ),
    action: "upsert",
    task,
    calendarId: "synthetic-list",
    targetKind: "household",
    targetState: "ready",
    eventId: marker,
    etag: null,
    reminderMinutes: null,
    attempts: 1,
  };
}
const workerRequest = () =>
  new Request(config.redirectUri, {
    method: "POST",
    headers: { authorization: `Bearer ${"s".repeat(32)}` },
  });
test("worker persists insertion attempt and returned identity before acknowledging sent version", async () => {
  const current = await job();
  const order: string[] = [];
  let result: unknown;
  const handler = createCalendarWorker({
    config,
    workerSecret: "s".repeat(32),
    tasksProvider: transport(async () => {
      order.push("POST");
      return Response.json({ id: "remote" });
    }),
    rpc: async (name, args) => {
      order.push(name);
      if (name === "gc_claim_jobs_v2") return [current];
      if (name === "gc_validate_job") return current;
      if (name === "gc_finish_job") result = args.result;
      return null;
    },
  });
  assert.deepEqual(await (await handler(workerRequest())).json(), {
    processed: 1,
    failed: 0,
  });
  assert.ok(order.indexOf("gc_tasks_attempt") < order.indexOf("POST"));
  assert.ok(
    order.indexOf("gc_tasks_identity") < order.indexOf("gc_finish_job"),
  );
  assert.deepEqual(result, { status: "synced", sentVersion: 1 });
});
test("worker never repeats POST after an ambiguous attempt", async () => {
  const current = { ...(await job()), insertionAttempted: true };
  let posts = 0;
  let result: unknown;
  const handler = createCalendarWorker({
    config,
    workerSecret: "s".repeat(32),
    tasksProvider: transport(async (_url, init) => {
      if (init?.method === "POST") posts++;
      return Response.json({ items: [] });
    }),
    rpc: async (name, args) => {
      if (name === "gc_claim_jobs_v2") return [current];
      if (name === "gc_validate_job") return current;
      if (name === "gc_finish_job") result = args.result;
      return null;
    },
  });
  await handler(workerRequest());
  assert.equal(posts, 0);
  assert.deepEqual(result, {
    status: "failed",
    errorCode: "tasks_creation_uncertain",
  });
});
test("failed identity persistence leaves an insertion uncertain rather than repeating POST", async () => {
  const current = await job();
  let posts = 0;
  const handler = createCalendarWorker({
    config,
    workerSecret: "s".repeat(32),
    tasksProvider: transport(async (_url, init) => {
      if (init?.method === "POST") {
        posts++;
        return Response.json({ id: "remote" });
      }
      return Response.json({
        items: [{ id: "remote", notes: `Gabio: ${marker}` }],
      });
    }),
    rpc: async (name) => {
      if (name === "gc_claim_jobs_v2") return [current];
      if (name === "gc_validate_job") return current;
      if (name === "gc_tasks_attempt") {
        current.insertionAttempted = true;
        return null;
      }
      if (name === "gc_tasks_identity")
        throw new Error("synthetic database error");
      return null;
    },
  });
  await handler(workerRequest());
  await handler(workerRequest());
  assert.equal(posts, 1);
});
test("reauthorization verifies existing Tasks lists before replacing credentials", async () => {
  const state = randomSecret();
  const verifier = randomSecret();
  let staged = false;
  const cipher = await seal({ verifier }, key, await hashSecret(state));
  const handler = createCalendarHandler({
    config,
    authenticate: async () => null,
    provider: new GoogleCalendarProvider(async (url) =>
      String(url).includes("/token")
        ? Response.json({
            access_token: "synthetic",
            refresh_token: "synthetic",
            expires_in: 3600,
            scope: `${CALENDAR_SCOPE} ${TASKS_SCOPE}`,
          })
        : new Response(null, { status: 404 }),
    ),
    rpc: async (name) => {
      if (name === "gc_consume_oauth")
        return {
          user_id: user,
          household_id: house,
          verifier_cipher: cipher,
          preferences: {
            exportHousehold: true,
            exportPrivate: false,
            reminderMinutes: null,
            writeTasks: true,
          },
        };
      if (name === "gc_export_oauth_context")
        return {
          scopes: [CALENDAR_SCOPE, TASKS_SCOPE],
          taskLists: ["existing-list"],
        };
      if (name === "gc_oauth_target_ids") return [];
      if (name === "gc_stage_oauth") staged = true;
      return null;
    },
  });
  const response = await handler(
    new Request(`${config.redirectUri}?state=${state}&code=synthetic`),
  );
  assert.match(response.headers.get("location")!, /google_calendar=error/);
  assert.equal(staged, false);
});
test("worker pause is propagated to database claim, without claiming Tasks for retry", async () => {
  let args: unknown;
  const handler = createCalendarWorker({
    config: { ...config, tasksWriteEnabled: false },
    workerSecret: "s".repeat(32),
    rpc: async (name, value) => {
      assert.equal(name, "gc_claim_jobs_v2");
      args = value;
      return [];
    },
  });
  await handler(workerRequest());
  assert.deepEqual(args, { batch_size: 2, tasks_enabled: false });
});
test("Tasks authorization is explicit, does not request calendar reading, and settings reject task IDs", async () => {
  const handler = createCalendarHandler({
    config,
    authenticate: async () => user,
    rpc: async (name) =>
      name === "gc_export_oauth_context" ? { scopes: [], taskLists: [] } : null,
  });
  const post = (body: unknown) =>
    new Request(config.redirectUri, {
      method: "POST",
      headers: { origin: config.appUrl, authorization: "Bearer synthetic" },
      body: JSON.stringify(body),
    });
  const prefs = {
    action: "connect",
    exportHousehold: true,
    exportPrivate: false,
    reminderMinutes: null,
    importUpcoming: false,
  };
  for (const writeTasks of [false, true]) {
    const response = await handler(post({ ...prefs, writeTasks }));
    const body = await response.json();
    const scopes = new URL(body.authorizationUrl).searchParams.get("scope")!;
    assert.equal(scopes.includes(TASKS_SCOPE), writeTasks);
    assert.equal(scopes.includes("calendar.events.readonly"), false);
  }
  assert.equal(
    (
      await handler(
        post({
          action: "export_preferences",
          destination: "google_tasks",
          commandId: id,
          expectedVersion: 1,
          taskId: id,
        }),
      )
    ).status,
    400,
  );
});
