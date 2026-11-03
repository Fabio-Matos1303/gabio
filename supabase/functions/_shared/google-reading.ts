import {
  GoogleCalendarProvider,
  parseStoredTokens,
  ProviderError,
  seal,
  unseal,
} from "./google-calendar-provider.ts";
import type { CalendarServiceDependencies } from "./google-calendar-service.ts";
export const GOOGLE_READ_SCOPES = [
  "https://www.googleapis.com/auth/tasks.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];
export type ReadItem = {
  id: string;
  remoteId: string;
  source: "google_tasks" | "google_calendar";
  sourceId: string;
  sourceName: string;
  title: string;
  status: "open" | "completed" | "event";
  date: string | null;
  startsAt: string | null;
  endsAt: string | null;
  endDate: string | null;
  url: string | null;
  updatedAt: string | null;
  tags: string[];
};
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid reading data");
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 1024): string {
  if (typeof value !== "string" || !value || value.length > max)
    throw new Error("invalid reading data");
  return value;
}
function instant(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error("invalid reading data");
  return new Date(value).toISOString();
}
function date(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\d$/.test(value) ||
    !Number.isFinite(Date.parse(value + "T12:00:00Z")) ||
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) !== value
  )
    throw new Error("invalid reading data");
  return value;
}
export function safeGoogleLink(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      ["tasks.google.com", "calendar.google.com", "www.google.com"].includes(
        u.hostname,
      )
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}
export function parseReadItem(
  value: unknown,
  source: ReadItem["source"],
  sourceId: string,
  sourceName: string,
  generation: string,
): ReadItem | null {
  const row = record(value);
  if (row.deleted === true || row.status === "cancelled") return null;
  const id = text(row.id);
  const base = {
    id: `${generation}:${source}:${encodeURIComponent(sourceId)}:${encodeURIComponent(id)}`,
    remoteId: id,
    source,
    sourceId,
    sourceName,
    title:
      typeof row.title === "string"
        ? row.title
        : typeof row.summary === "string"
          ? row.summary
          : "Sem título",
    url: safeGoogleLink(row.webViewLink ?? row.htmlLink),
    updatedAt: instant(row.updated),
    tags: [] as string[],
  };
  if (base.title.length > 1024) throw new Error("invalid reading data");
  if (source === "google_tasks") {
    if (!["needsAction", "completed"].includes(String(row.status)))
      throw new Error("invalid reading data");
    return {
      ...base,
      status: row.status === "completed" ? "completed" : "open",
      date: row.due === undefined ? null : date(text(row.due).slice(0, 10)),
      startsAt: null,
      endsAt: null,
      endDate: null,
    };
  }
  const start = record(row.start),
    end = record(row.end);
  const day = date(start.date),
    endDay = date(end.date);
  const startsAt = instant(start.dateTime),
    endsAt = instant(end.dateTime);
  if (
    day
      ? !endDay || startsAt || endsAt || endDay <= day
      : !startsAt ||
        !endsAt ||
        endDay ||
        Date.parse(endsAt) <= Date.parse(startsAt)
  )
    throw new Error("invalid event interval");
  return {
    ...base,
    status: "event",
    date: day,
    startsAt,
    endsAt,
    endDate: endDay,
  };
}
type Context = {
  state: "connected";
  connectionId: string;
  generation: string;
  userId: string;
  householdId: string;
  tokenCipher: string;
  links: {
    calendarId: string;
    eventId: string;
    provider?: "google_tasks" | "google_calendar";
  }[];
  annotations: { listId: string; taskId: string; tags: string[] }[];
};
function parseContext(value: unknown): Context | null {
  const r = record(value);
  if (r.state !== "connected") return null;
  for (const k of ["connectionId", "generation", "userId", "householdId"])
    if (!/^[a-f0-9-]{36}$/i.test(String(r[k])))
      throw new Error("invalid read context");
  text(r.tokenCipher, 20000);
  if (
    !Array.isArray(r.links) ||
    !Array.isArray(r.annotations) ||
    r.links.length > 100000 ||
    r.annotations.length > 100000
  )
    throw new Error("invalid read context");
  for (const raw of r.links) {
    const l = record(raw);
    text(l.calendarId);
    text(l.eventId);
    if (
      l.provider !== undefined &&
      !["google_tasks", "google_calendar"].includes(String(l.provider))
    )
      throw new Error("invalid read context");
  }
  for (const raw of r.annotations) {
    const a = record(raw);
    text(a.listId);
    text(a.taskId);
    if (!Array.isArray(a.tags) || a.tags.length > 10)
      throw new Error("invalid read context");
    a.tags.forEach((t) => text(t, 32));
  }
  return r as unknown as Context;
}
export async function readGoogleItems(
  deps: CalendarServiceDependencies,
  actor: string,
  month: string,
  continuation?: string,
) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("invalid month");
  const empty = (state: string) => ({
    state,
    generation: null,
    checkedAt: new Date().toISOString(),
    tasksState: "ok",
    calendarState: "ok",
    items: [],
    sources: [],
    continuation: null,
  });
  if (!deps.config.readingEnabled) return empty("disabled");
  const raw = record(await deps.rpc("gc_read_context", { actor, claim: true }));
  const context = parseContext(raw);
  if (!context) {
    const result = empty(
      ["consent_required", "reconnect", "rate_limited"].includes(
        String(raw.state),
      )
        ? String(raw.state)
        : "reconnect",
    );
    return {
      ...result,
      generation:
        raw.state === "rate_limited" &&
        /^[a-f0-9-]{36}$/i.test(String(raw.generation))
          ? String(raw.generation)
          : null,
    };
  }
  if (context.userId !== actor) throw new Error("invalid context actor");
  const provider = deps.provider ?? new GoogleCalendarProvider();
  let tokens = parseStoredTokens(
    await unseal(
      context.tokenCipher,
      deps.config.encryptionKey,
      `${actor}:${context.householdId}`,
    ),
  );
  if (tokens.expiresAt < Date.now() + 60000) {
    try {
      tokens = await provider.refresh(
        deps.config.clientId,
        deps.config.clientSecret,
        tokens,
      );
      const cipher = await seal(
        tokens,
        deps.config.encryptionKey,
        `${actor}:${context.householdId}`,
      );
      if (
        (await deps.rpc("gc_read_update_token", {
          actor,
          generation: context.generation,
          previous_cipher: context.tokenCipher,
          token_cipher: cipher,
        })) !== true
      )
        throw new Error("connection changed");
    } catch {
      return empty("reconnect");
    }
  }
  const items: ReadItem[] = [];
  const sources: { id: string; name: string; source: ReadItem["source"] }[] =
    [];
  const deadline = Date.now() + 24000;
  const gridStart = new Date(`${month}-01T12:00:00Z`);
  gridStart.setUTCDate(1 - ((gridStart.getUTCDay() + 6) % 7));
  const gridEnd = new Date(gridStart);
  gridEnd.setUTCDate(gridEnd.getUTCDate() + 42);
  const start = gridStart.toISOString().slice(0, 10) + "T00:00:00-03:00";
  const end = gridEnd.toISOString().slice(0, 10) + "T00:00:00-03:00";
  type Cursor = {
    containerPage: string;
    index: number;
    itemPage: string;
    done: boolean;
    failed: boolean;
  };
  let cursors: Record<"google_tasks" | "google_calendar", Cursor> = {
    google_tasks: {
      containerPage: "",
      index: 0,
      itemPage: "",
      done: false,
      failed: false,
    },
    google_calendar: {
      containerPage: "",
      index: 0,
      itemPage: "",
      done: false,
      failed: false,
    },
  };
  if (continuation) {
    const decoded = record(
      await unseal(
        continuation,
        deps.config.encryptionKey,
        `read:${actor}:${context.generation}:${month}`,
      ),
    );
    if (typeof decoded.expiresAt !== "number" || decoded.expiresAt < Date.now())
      throw new Error("expired cursor");
    for (const source of ["google_tasks", "google_calendar"] as const) {
      const c = record(decoded[source]);
      if (
        typeof c.containerPage !== "string" ||
        c.containerPage.length > 1024 ||
        typeof c.itemPage !== "string" ||
        c.itemPage.length > 1024 ||
        !Number.isSafeInteger(c.index) ||
        Number(c.index) < 0 ||
        Number(c.index) > 1000 ||
        typeof c.done !== "boolean" ||
        typeof c.failed !== "boolean"
      )
        throw new Error("invalid cursor");
      cursors[source] = c as Cursor;
    }
  }
  async function sourceItems(
    source: ReadItem["source"],
  ): Promise<"ok" | "partial" | "error"> {
    let requests = 0;
    let hadError = false;
    const cursor = cursors[source];
    if (cursor.done) return "ok";
    const api =
      source === "google_tasks"
        ? "https://tasks.googleapis.com/tasks/v1"
        : "https://www.googleapis.com/calendar/v3";
    async function get(path: string, params: Record<string, string>) {
      requests++;
      const url = new URL(api + path);
      url.search = new URLSearchParams(params).toString();
      const response = await provider.request(url.toString(), {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(6000, deadline - Date.now())),
        ),
      });
      if (!response.ok)
        throw new ProviderError(
          response.status === 401 ? "reconnect" : "unavailable",
        );
      const body = await response.text();
      if (body.length > 2000000) throw new Error("response too large");
      const page = record(JSON.parse(body));
      if (page.items !== undefined && !Array.isArray(page.items))
        throw new Error("invalid page");
      if (((page.items ?? []) as unknown[]).length > 1000)
        throw new Error("invalid page");
      return page;
    }
    const pageToken = (page: Record<string, unknown>) =>
      page.nextPageToken === undefined ? "" : text(page.nextPageToken, 1024);
    try {
      const seen = new Set<string>();
      while (!cursor.done && requests < 18 && Date.now() < deadline) {
        const containerPage = await get(
          source === "google_tasks"
            ? "/users/@me/lists"
            : "/users/me/calendarList",
          {
            ...(source === "google_tasks"
              ? { maxResults: "1000", fields: "items(id,title),nextPageToken" }
              : {
                  maxResults: "250",
                  minAccessRole: "reader",
                  fields: "items(id,summary),nextPageToken",
                }),
            ...(cursor.containerPage
              ? { pageToken: cursor.containerPage }
              : {}),
          },
        );
        const containers = ((containerPage.items ?? []) as unknown[]).map(
          (raw) => {
            const r = record(raw);
            return {
              id: text(r.id),
              name: text(source === "google_tasks" ? r.title : r.summary),
            };
          },
        );
        sources.push(...containers.map((c) => ({ ...c, source })));
        while (
          cursor.index < containers.length &&
          requests < 18 &&
          Date.now() < deadline
        ) {
          const container = containers[cursor.index]!;
          const marker = `${container.id}:${cursor.itemPage}`;
          if (seen.has(marker)) throw new Error("page cycle");
          seen.add(marker);
          let page: Record<string, unknown>;
          try {
            page = await get(
              source === "google_tasks"
                ? `/lists/${encodeURIComponent(container.id)}/tasks`
                : `/calendars/${encodeURIComponent(container.id)}/events`,
              {
                ...(source === "google_tasks"
                  ? {
                      maxResults: "100",
                      showCompleted: "true",
                      showHidden: "true",
                      showAssigned: "true",
                      showDeleted: "false",
                      fields:
                        "items(id,title,status,due,updated,deleted,webViewLink),nextPageToken",
                    }
                  : {
                      maxResults: "100",
                      singleEvents: "true",
                      timeMin: start,
                      timeMax: end,
                      orderBy: "startTime",
                      timeZone: "America/Bahia",
                      fields:
                        "items(id,summary,status,start,end,updated,htmlLink),nextPageToken",
                    }),
                ...(cursor.itemPage ? { pageToken: cursor.itemPage } : {}),
              },
            );
          } catch {
            hadError = true;
            cursor.failed = true;
            cursor.index++;
            cursor.itemPage = "";
            continue;
          }
          for (const raw of (page.items ?? []) as unknown[]) {
            const item = parseReadItem(
              raw,
              source,
              container.id,
              container.name,
              context!.generation,
            );
            if (!item) continue;
            if (
              context!.links.some(
                (l) =>
                  (l.provider ?? "google_calendar") === source &&
                  l.calendarId === container.id &&
                  l.eventId === item.remoteId,
              )
            )
              continue;
            item.tags =
              source === "google_tasks"
                ? (context!.annotations.find(
                    (a) =>
                      a.listId === container.id && a.taskId === item.remoteId,
                  )?.tags ?? [])
                : [];
            items.push(item);
          }
          cursor.itemPage = pageToken(page);
          if (!cursor.itemPage) cursor.index++;
        }
        if (cursor.index >= containers.length) {
          const nextPage = pageToken(containerPage);
          if (nextPage && nextPage === cursor.containerPage)
            throw new Error("page cycle");
          cursor.containerPage = nextPage;
          cursor.index = 0;
          cursor.itemPage = "";
          cursor.done = !nextPage;
        }
      }
      return cursor.done && !hadError && !cursor.failed ? "ok" : "partial";
    } catch {
      return "error";
    }
  }
  // Independent budgets and partial failure states. No automatic polling/retries against Google.
  const [tasksState, calendarState] = await Promise.all([
    sourceItems("google_tasks"),
    sourceItems("google_calendar"),
  ]);
  const current = parseContext(
    await deps.rpc("gc_read_context", { actor, claim: false }),
  );
  if (
    !current ||
    current.generation !== context.generation ||
    current.connectionId !== context.connectionId
  )
    return empty("reconnect");
  return {
    state: "connected",
    generation: context.generation,
    checkedAt: new Date().toISOString(),
    tasksState,
    calendarState,
    items: Array.from(new Map(items.map((i) => [i.id, i])).values()),
    sources: Array.from(
      new Map(sources.map((s) => [s.source + ":" + s.id, s])).values(),
    ),
    continuation:
      cursors.google_tasks.done && cursors.google_calendar.done
        ? null
        : await seal(
            { ...cursors, expiresAt: Date.now() + 1800000 },
            deps.config.encryptionKey,
            `read:${actor}:${context.generation}:${month}`,
          ),
  };
}
