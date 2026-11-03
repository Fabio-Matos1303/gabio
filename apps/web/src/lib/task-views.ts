import type { Task } from "@gabio/contracts";
import { z } from "zod";

export const tagRecordSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(32),
    visibility: z.enum(["household", "private"]),
    version: z.number().int().positive(),
  })
  .strict();
export type TagRecord = z.infer<typeof tagRecordSchema>;
export const tagMutationSchema = z.discriminatedUnion("type", [
  z
    .object({
      commandId: z.string().uuid(),
      type: z.literal("rename"),
      tagId: z.string().uuid(),
      expectedVersion: z.number().int().positive(),
      name: z.string().trim().min(1).max(32),
    })
    .strict(),
  z
    .object({
      commandId: z.string().uuid(),
      type: z.literal("delete"),
      tagId: z.string().uuid(),
      expectedVersion: z.number().int().positive(),
    })
    .strict(),
]);
export type TagMutation = z.infer<typeof tagMutationSchema>;
const googleLink = z
  .string()
  .url()
  .refine((value) => {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      ["tasks.google.com", "calendar.google.com", "www.google.com"].includes(
        u.hostname,
      )
    );
  });
export const externalItemSchema = z
  .object({
    id: z.string().min(1).max(7000),
    remoteId: z.string().min(1).max(1024),
    source: z.enum(["google_tasks", "google_calendar"]),
    sourceId: z.string().min(1).max(1024),
    sourceName: z.string().max(1024),
    title: z.string().max(1024),
    status: z.enum(["open", "completed", "event"]),
    date: z.string().date().nullable(),
    startsAt: z.string().datetime({ offset: true }).nullable(),
    endsAt: z.string().datetime({ offset: true }).nullable(),
    endDate: z.string().date().nullable(),
    url: googleLink.nullable(),
    updatedAt: z.string().datetime({ offset: true }).nullable(),
    tags: z.array(z.string().min(1).max(32)).max(10),
  })
  .strict();
export type ExternalItem = z.infer<typeof externalItemSchema>;
export const googleReadingSchema = z
  .object({
    continuation: z.string().max(8192).nullable().optional(),
    state: z.enum([
      "disabled",
      "consent_required",
      "connected",
      "reconnect",
      "rate_limited",
    ]),
    generation: z.string().uuid().nullable(),
    checkedAt: z.string().datetime({ offset: true }),
    tasksState: z.enum(["ok", "partial", "error"]),
    calendarState: z.enum(["ok", "partial", "error"]),
    items: z.array(externalItemSchema).max(4000),
    sources: z
      .array(
        z
          .object({
            id: z.string().min(1).max(1024),
            name: z.string().max(1024),
            source: z.enum(["google_tasks", "google_calendar"]),
          })
          .strict(),
      )
      .max(10000),
  })
  .strict();
export type GoogleReading = z.infer<typeof googleReadingSchema>;
export const externalTagsCommandSchema = z
  .object({
    commandId: z.string().uuid(),
    generation: z.string().uuid(),
    listId: z.string().min(1).max(1024),
    taskId: z.string().min(1).max(1024),
    tags: z.array(z.string().trim().min(1).max(32)).max(10),
  })
  .strict();
export type ExternalTagsCommand = z.infer<typeof externalTagsCommandSchema>;
export type ViewItem = {
  id: string;
  title: string;
  source: "gabio" | "google_tasks" | "google_calendar";
  sourceId: string;
  status: Task["status"] | "event";
  date: string | null;
  startsAt: string | null;
  endsAt: string | null;
  endDate: string | null;
  tags: string[];
  visibility: "household" | "private";
  assigneeUserId: string | null;
  recurring: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
  task?: Task;
  external?: ExternalItem;
};
export const householdDate = (date: Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Bahia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export const normalizeSearch = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");
export function viewItems(tasks: Task[], external: ExternalItem[]): ViewItem[] {
  return [
    ...tasks
      .filter((t) => t.status !== "cancelled")
      .map((t) => ({
        id: t.id,
        title: t.title,
        source: "gabio" as const,
        sourceId: "gabio",
        status: t.status,
        date: t.dueAt ? householdDate(new Date(t.dueAt)) : null,
        startsAt: t.dueAt ? new Date(t.dueAt).toISOString() : null,
        endsAt: t.kind === "event" ? (t.eventEndsAt ?? null) : null,
        endDate: null,
        tags: t.tags ?? [],
        visibility: t.visibility,
        assigneeUserId: t.assigneeUserId,
        recurring: t.recurrence !== "none",
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        task: t,
      })),
    ...external.map((e) => ({
      id: e.id,
      title: e.title,
      source: e.source,
      sourceId: e.sourceId,
      status: e.status,
      date: e.date ?? (e.startsAt ? householdDate(new Date(e.startsAt)) : null),
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      endDate: e.endDate,
      tags: e.tags,
      visibility: "private" as const,
      assigneeUserId: null,
      recurring: null,
      createdAt: null,
      updatedAt: e.updatedAt,
      external: e,
    })),
  ];
}
export type TaskFilters = {
  search: string;
  statuses: string[];
  due: string;
  from: string;
  to: string;
  assignee: string;
  visibility: string;
  recurrence: string;
  tags: string[];
  tagMode: "any" | "all" | "none";
  sources: string[];
  sourceIds: string[];
  sort: string;
};
export const initialTaskFilters: TaskFilters = {
  search: "",
  statuses: [],
  due: "all",
  from: "",
  to: "",
  assignee: "all",
  visibility: "all",
  recurrence: "all",
  tags: [],
  tagMode: "any",
  sources: ["gabio", "google_tasks", "google_calendar"],
  sourceIds: [],
  sort: "due_asc",
};
export function selectViewItems(
  items: ViewItem[],
  f: TaskFilters,
  now = new Date(),
): ViewItem[] {
  const today = householdDate(now);
  const next = new Date(`${today}T12:00:00-03:00`);
  next.setUTCDate(next.getUTCDate() + 6);
  const last = householdDate(next);
  const selected = items.filter((i) => {
    if (
      !normalizeSearch(i.title).includes(normalizeSearch(f.search)) ||
      !f.sources.includes(i.source)
    )
      return false;
    if (
      f.sourceIds.length &&
      i.source !== "gabio" &&
      !f.sourceIds.includes(`${i.source}:${i.sourceId}`)
    )
      return false;
    if (f.statuses.length && !f.statuses.includes(i.status)) return false;
    if (f.visibility !== "all" && i.visibility !== f.visibility) return false;
    if (
      f.assignee !== "all" &&
      (i.source !== "gabio" ||
        (f.assignee === "none"
          ? i.assigneeUserId !== null
          : i.assigneeUserId !== f.assignee))
    )
      return false;
    if (
      f.recurrence !== "all" &&
      (i.recurring === null || i.recurring !== (f.recurrence === "yes"))
    )
      return false;
    if (f.tagMode === "none" && (i.status === "event" || i.tags.length))
      return false;
    if (
      f.tags.length &&
      (i.status === "event" ||
        !(f.tagMode === "all"
          ? f.tags.every((t) => i.tags.includes(t))
          : f.tags.some((t) => i.tags.includes(t))))
    )
      return false;
    if (f.due === "none" && i.date !== null) return false;
    if (
      f.due === "overdue" &&
      !(
        i.source === "gabio" &&
        ["open", "in_progress"].includes(i.status) &&
        i.startsAt &&
        Date.parse(i.startsAt) < now.getTime()
      )
    )
      return false;
    if (f.due === "today" && !itemOnDay(i, today)) return false;
    if (
      f.due === "week" &&
      !(
        i.date &&
        i.date <= last &&
        ((i.endDate && i.endDate > today) ||
          (i.endsAt &&
            householdDate(new Date(Date.parse(i.endsAt) - 1)) >= today) ||
          i.date >= today)
      )
    )
      return false;
    if (
      f.due === "range" &&
      (!i.date ||
        (f.from &&
          (i.endDate
            ? i.endDate <= f.from
            : i.endsAt
              ? householdDate(new Date(Date.parse(i.endsAt) - 1)) < f.from
              : i.date < f.from)) ||
        (f.to && i.date > f.to))
    )
      return false;
    return true;
  });
  const cmp = (a: string | null, b: string | null, dir = 1) =>
    a === null
      ? b === null
        ? 0
        : 1
      : b === null
        ? -1
        : dir * a.localeCompare(b, "pt-BR", { sensitivity: "base" });
  return selected.sort((a, b) => {
    let n: number;
    switch (f.sort) {
      case "due_asc":
        n = cmp(a.date, b.date) || cmp(a.startsAt, b.startsAt);
        break;
      case "due_desc":
        n = cmp(a.date, b.date, -1) || cmp(a.startsAt, b.startsAt, -1);
        break;
      case "updated_desc":
        n = cmp(a.updatedAt, b.updatedAt, -1);
        break;
      case "title":
        n = cmp(a.title, b.title);
        break;
      default:
        n = cmp(a.createdAt, b.createdAt, -1);
    }
    return n || cmp(a.createdAt, b.createdAt, -1) || a.id.localeCompare(b.id);
  });
}
export function itemOnDay(i: ViewItem, day: string) {
  if (!i.date) return false;
  if (i.status !== "event") return i.date === day;
  const last =
    i.endDate ??
    (i.endsAt ? householdDate(new Date(Date.parse(i.endsAt) - 1)) : null);
  return (
    i.date <= day && (i.endDate ? day < i.endDate : day <= (last ?? i.date))
  );
}
