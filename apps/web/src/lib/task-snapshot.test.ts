import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@gabio/contracts";
import {
  readTaskSnapshot,
  writeTaskSnapshot,
  clearTaskSnapshots,
  projectTaskCommands,
} from "./task-snapshot.js";
import { MemoryTaskCommandQueue } from "./task-queue.js";
const context = {
  userId: "10000000-0000-4000-8000-000000000001",
  householdId: "20000000-0000-4000-8000-000000000001",
};
const other = { ...context, userId: "10000000-0000-4000-8000-000000000002" };
const task: Task = {
  id: "40000000-0000-4000-8000-000000000001",
  householdId: context.householdId,
  ownerUserId: context.userId,
  createdBy: context.userId,
  assigneeUserId: null,
  title: "Tarefa sintética",
  dueAt: null,
  visibility: "private",
  recurrence: "none",
  status: "open",
  completedAt: null,
  version: 1,
  createdAt: "2026-10-28T12:00:00Z",
  updatedAt: "2026-10-28T12:00:00Z",
};
describe("task snapshots", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  it("isolates accounts and rejects private rows belonging to another user", () => {
    writeTaskSnapshot(context, [task]);
    expect(readTaskSnapshot(context)).toEqual([task]);
    expect(readTaskSnapshot(other)).toEqual([]);
    writeTaskSnapshot(other, [task]);
    expect(readTaskSnapshot(other)).toEqual([]);
    clearTaskSnapshots();
    expect(readTaskSnapshot(context)).toEqual([]);
  });
  it("expires cached data and tolerates corrupt storage", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(100000000);
    writeTaskSnapshot(context, [task]);
    clock.mockReturnValue(200000000);
    expect(readTaskSnapshot(context)).toEqual([]);
    localStorage.setItem(
      "gabio-task-snapshot:" + context.userId + ":" + context.householdId,
      "invalid",
    );
    expect(readTaskSnapshot(context)).toEqual([]);
  });
  it("projects pending creation only for its owner and does not invent recurrence completion", async () => {
    const queue = new MemoryTaskCommandQueue();
    await queue.put(context, {
      commandId: "30000000-0000-4000-8000-000000000001",
      type: "create",
      payload: {
        title: "Criação offline",
        visibility: "household",
        recurrence: "none",
        dueAt: null,
        assigneeUserId: null,
      },
    });
    const entries = await queue.list(context);
    expect(projectTaskCommands([], entries, context)[0]?.title).toBe(
      "Criação offline",
    );
    expect(projectTaskCommands([], entries, other)).toEqual([]);
    await queue.update(
      context,
      entries[0]!.command.commandId,
      "conflict",
      null,
    );
    expect(projectTaskCommands([], await queue.list(context), context)).toEqual(
      [],
    );
  });
});
