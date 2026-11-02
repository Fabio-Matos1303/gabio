import { describe, it, expect } from "vitest";
import { taskSchema, taskTagsSchema } from "@gabio/contracts";
import {
  householdDate,
  initialTaskFilters,
  itemOnDay,
  selectViewItems,
  viewItems,
  type ExternalItem,
} from "./task-views.js";
const base = {
  id: "10000000-0000-4000-8000-000000000001",
  householdId: "20000000-0000-4000-8000-000000000001",
  ownerUserId: "30000000-0000-4000-8000-000000000001",
  createdBy: "30000000-0000-4000-8000-000000000001",
  assigneeUserId: null,
  title: "Manutenção",
  dueAt: "2026-11-03T01:00:00Z",
  visibility: "household",
  recurrence: "none",
  status: "open",
  completedAt: null,
  version: 1,
  createdAt: "2026-11-01T12:00:00Z",
  updatedAt: "2026-11-01T12:00:00Z",
  tags: ["Casa", "Manutenção"],
};
const task = (overrides: Record<string, unknown> = {}) =>
  taskSchema.parse({ ...base, ...overrides });
const external: ExternalItem = {
  id: "external",
  remoteId: "task",
  source: "google_tasks",
  sourceId: "list",
  sourceName: "Lista fictícia",
  title: "Materiais",
  status: "open",
  date: "2026-11-02",
  startsAt: null,
  endsAt: null,
  endDate: null,
  url: null,
  updatedAt: null,
  tags: [],
};
describe("task views", () => {
  it("uses household date across UTC midnight without moving Google civil dates", () => {
    expect(householdDate(new Date("2026-11-03T01:00:00Z"))).toBe("2026-11-02");
    expect(viewItems([task()], [external]).map((i) => i.date)).toEqual([
      "2026-11-02",
      "2026-11-02",
    ]);
  });
  it("combines accent-insensitive search, status and tags with explicit ANY/ALL", () => {
    const items = viewItems(
      [
        task(),
        task({
          id: "10000000-0000-4000-8000-000000000002",
          title: "Compras",
          tags: ["Casa"],
        }),
      ],
      [],
    );
    expect(
      selectViewItems(items, {
        ...initialTaskFilters,
        search: "MANUTENCAO",
        tags: ["Casa", "Manutenção"],
        tagMode: "all",
      }),
    ).toHaveLength(1);
    expect(
      selectViewItems(items, {
        ...initialTaskFilters,
        tags: ["Casa", "Manutenção"],
        tagMode: "any",
      }),
    ).toHaveLength(2);
    expect(
      selectViewItems(items, {
        ...initialTaskFilters,
        tags: ["Casa", "Manutenção"],
        tagMode: "all",
      }),
    ).toHaveLength(1);
  });
  it("overdue is only a local active deadline, never Google scheduled dates or completed tasks", () => {
    const items = viewItems(
      [
        task(),
        task({
          id: "10000000-0000-4000-8000-000000000002",
          status: "completed",
          completedAt: "2026-11-03T02:00:00Z",
        }),
      ],
      [external],
    );
    expect(
      selectViewItems(
        items,
        { ...initialTaskFilters, due: "overdue" },
        new Date("2026-11-04T00:00:00Z"),
      ).map((i) => i.source),
    ).toEqual(["gabio"]);
  });
  it("keeps undated items last in both deadline orders and uses deterministic ties", () => {
    const items = viewItems(
      [
        task({ dueAt: null }),
        task({ id: "10000000-0000-4000-8000-000000000002" }),
      ],
      [],
    );
    for (const sort of ["due_asc", "due_desc"])
      expect(
        selectViewItems(items, { ...initialTaskFilters, sort }).at(-1)?.date,
      ).toBeNull();
  });
  it("honors exclusive all-day end dates and timed events that end at midnight", () => {
    const item = {
      ...viewItems([], [external])[0]!,
      status: "event" as const,
      date: "2026-11-02",
      endDate: "2026-11-04",
    };
    expect(itemOnDay(item, "2026-11-03")).toBe(true);
    expect(itemOnDay(item, "2026-11-04")).toBe(false);
    expect(
      itemOnDay(
        { ...item, endDate: null, endsAt: "2026-11-04T03:00:00Z" },
        "2026-11-04",
      ),
    ).toBe(false);
  });
  it("no-tags excludes events and filters by origin independently", () => {
    const event = {
      ...external,
      id: "event",
      source: "google_calendar" as const,
      status: "event" as const,
    };
    const items = viewItems([task()], [external, event]);
    expect(
      selectViewItems(items, { ...initialTaskFilters, tagMode: "none" }).map(
        (i) => i.id,
      ),
    ).toEqual(["external"]);
    expect(
      selectViewItems(items, { ...initialTaskFilters, sources: ["gabio"] }),
    ).toHaveLength(1);
  });
  it("includes today and six following dates only for the week preset", () => {
    const items = viewItems(
      [],
      ["2026-11-01", "2026-11-02", "2026-11-08", "2026-11-09"].map((date) => ({
        ...external,
        id: date,
        date,
      })),
    );
    expect(
      selectViewItems(
        items,
        { ...initialTaskFilters, due: "week" },
        new Date("2026-11-02T12:00:00Z"),
      ).map((i) => i.date),
    ).toEqual(["2026-11-02", "2026-11-08"]);
  });
  it("normalizes tag whitespace, bounds counts and rejects case duplicates", () => {
    expect(taskTagsSchema.parse(["  Casa   limpa "])).toEqual(["Casa limpa"]);
    expect(taskTagsSchema.safeParse(["Casa", "casa"]).success).toBe(false);
    expect(
      taskTagsSchema.safeParse(Array.from({ length: 11 }, (_, i) => String(i)))
        .success,
    ).toBe(false);
    expect(taskTagsSchema.safeParse(["x".repeat(33)]).success).toBe(false);
  });
});
