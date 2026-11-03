import {
  GoogleCalendarProvider,
  ProviderError,
} from "./google-calendar-provider.ts";

export const TASKS_SCOPE = "https://www.googleapis.com/auth/tasks";
const API = "https://tasks.googleapis.com/tasks/v1";
export type TasksProjection = {
  id: string;
  title: string;
  dueAt: string | null;
  status: string;
  version: number;
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ProviderError("invalid_response");
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 1024 ||
    /[\u0000-\u001f]/.test(value)
  )
    throw new ProviderError("invalid_response");
  return value;
}
export function projectGoogleTask(
  task: TasksProjection,
  marker: string,
  appUrl: string,
) {
  if (
    !/^[0-9a-f-]{36}$/i.test(task.id) ||
    !task.title.trim() ||
    task.title.length > 240 ||
    !["open", "in_progress", "completed"].includes(task.status) ||
    !/^[a-v0-9]{5,1024}$/.test(marker) ||
    !Number.isSafeInteger(task.version) ||
    task.version < 1
  )
    throw new ProviderError("invalid_response");
  let due: string | null = null;
  if (task.dueAt !== null) {
    if (!Number.isFinite(Date.parse(task.dueAt)))
      throw new ProviderError("invalid_response");
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bahia",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(task.dueAt));
    const part = (name: string) => parts.find((p) => p.type === name)!.value;
    due = `${part("year")}-${part("month")}-${part("day")}T00:00:00.000Z`;
  }
  return {
    title: task.title,
    notes: `Gerencie pelo Gabio: ${new URL("/#tarefas", appUrl)}\nGabio: ${marker}`,
    status: task.status === "completed" ? "completed" : "needsAction",
    due,
    ...(task.status === "completed" ? {} : { completed: null }),
  };
}

export class GoogleTasksProvider {
  constructor(private readonly transport = new GoogleCalendarProvider()) {}
  private async call(
    token: string,
    path: string,
    method = "GET",
    body?: unknown,
  ) {
    const response = await this.transport.request(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      if (response.status === 403) {
        const raw = await response.text();
        if (raw.length <= 2000000) {
          try {
            const error = object(object(JSON.parse(raw)).error);
            if (
              Array.isArray(error.errors) &&
              error.errors.some(
                (item) =>
                  item &&
                  typeof item === "object" &&
                  [
                    "rateLimitExceeded",
                    "userRateLimitExceeded",
                    "quotaExceeded",
                    "dailyLimitExceeded",
                  ].includes(String((item as Record<string, unknown>).reason)),
              )
            )
              throw new ProviderError("rate_limited", true);
          } catch (error) {
            if (error instanceof ProviderError && error.code === "rate_limited")
              throw error;
          }
        }
      }
      if (response.status === 401 || response.status === 403)
        throw new ProviderError("reconnect");
      if ([404, 410].includes(response.status))
        throw new ProviderError("not_found");
      if (response.status === 412) throw new ProviderError("conflict");
      throw new ProviderError(
        "unavailable",
        response.status === 429 || response.status >= 500,
      );
    }
    if (response.status === 204) return {};
    const raw = await response.text();
    if (raw.length > 2_000_000) throw new ProviderError("invalid_response");
    try {
      return object(JSON.parse(raw));
    } catch {
      throw new ProviderError("invalid_response");
    }
  }
  private async insert(token: string, path: string, body: unknown) {
    // Even invalid success bodies and rejected persistence can follow a committed POST.
    try {
      return identifier((await this.call(token, path, "POST", body)).id);
    } catch {
      throw new ProviderError("tasks_creation_uncertain");
    }
  }
  createList(token: string, kind: "household" | "private") {
    return this.insert(token, "/users/@me/lists", {
      title: kind === "household" ? "Gabio - Casa" : "Gabio - Privado",
    });
  }
  async verifyList(token: string, list: string) {
    const data = await this.call(
      token,
      `/users/@me/lists/${encodeURIComponent(identifier(list))}`,
    );
    if (data.id !== list) throw new ProviderError("invalid_response");
  }
  createTask(
    token: string,
    list: string,
    task: ReturnType<typeof projectGoogleTask>,
  ) {
    return this.insert(
      token,
      `/lists/${encodeURIComponent(identifier(list))}/tasks`,
      task,
    );
  }
  async updateTask(
    token: string,
    list: string,
    id: string,
    task: ReturnType<typeof projectGoogleTask>,
  ) {
    const data = await this.call(
      token,
      `/lists/${encodeURIComponent(identifier(list))}/tasks/${encodeURIComponent(identifier(id))}`,
      "PATCH",
      task,
    );
    if (data.id !== id) throw new ProviderError("invalid_response");
  }
  async removeTask(token: string, list: string, id: string) {
    try {
      await this.call(
        token,
        `/lists/${encodeURIComponent(identifier(list))}/tasks/${encodeURIComponent(identifier(id))}`,
        "DELETE",
      );
    } catch (error) {
      if (!(error instanceof ProviderError) || error.code !== "not_found")
        throw error;
    }
  }
  async findAttempt(
    token: string,
    list: string,
    marker: string,
  ): Promise<string | null> {
    if (!/^[a-v0-9]{5,1024}$/.test(marker))
      throw new ProviderError("invalid_response");
    let page = "";
    const matches = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const query = new URLSearchParams({
        maxResults: "100",
        showCompleted: "true",
        showHidden: "true",
        ...(page ? { pageToken: page } : {}),
      });
      const data = await this.call(
        token,
        `/lists/${encodeURIComponent(identifier(list))}/tasks?${query}`,
      );
      if (
        data.items !== undefined &&
        (!Array.isArray(data.items) || data.items.length > 100)
      )
        throw new ProviderError("invalid_response");
      for (const raw of (data.items ?? []) as unknown[]) {
        const item = object(raw);
        if (
          (item.deleted !== undefined && typeof item.deleted !== "boolean") ||
          (item.status !== undefined &&
            !["needsAction", "completed"].includes(String(item.status)))
        )
          throw new ProviderError("invalid_response");
        if (
          item.deleted !== true &&
          typeof item.notes === "string" &&
          item.notes.split("\n").includes(`Gabio: ${marker}`)
        )
          matches.add(identifier(item.id));
      }
      if (data.nextPageToken === undefined)
        return matches.size === 1 ? [...matches][0]! : null;
      page = identifier(data.nextPageToken);
    }
    return null;
  }
}
