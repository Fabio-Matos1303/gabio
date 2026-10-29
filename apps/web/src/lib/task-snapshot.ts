import { taskSchema, type Task } from "@gabio/contracts";
import { z } from "zod";
import type { QueueContext, QueuedTaskCommand } from "./task-queue.js";

const snapshotSchema = z
  .object({ savedAt: z.number().finite(), tasks: z.array(taskSchema) })
  .strict();
const prefix = "gabio-task-snapshot:";
const keyFor = (context: QueueContext) =>
  prefix + context.userId + ":" + context.householdId;
const visible = (task: Task, context: QueueContext) =>
  task.householdId === context.householdId &&
  (task.visibility === "household" || task.ownerUserId === context.userId);
export function readTaskSnapshot(context: QueueContext): Task[] {
  try {
    const parsed = snapshotSchema.safeParse(
      JSON.parse(localStorage.getItem(keyFor(context)) ?? "null"),
    );
    if (
      !parsed.success ||
      Date.now() - parsed.data.savedAt > 86_400_000 ||
      parsed.data.savedAt > Date.now()
    )
      return [];
    return parsed.data.tasks.filter((task) => visible(task, context));
  } catch {
    return [];
  }
}
export function writeTaskSnapshot(context: QueueContext, tasks: Task[]) {
  try {
    const parsed = snapshotSchema.parse({ savedAt: Date.now(), tasks });
    localStorage.setItem(
      keyFor(context),
      JSON.stringify({
        ...parsed,
        tasks: parsed.tasks.filter((task) => visible(task, context)),
      }),
    );
  } catch {
    /* Storage can be unavailable; online operation remains usable. */
  }
}
export function clearTaskSnapshots() {
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith(prefix)) localStorage.removeItem(key);
  } catch {
    /* Storage unavailable. */
  }
}
export function projectTaskCommands(
  tasks: Task[],
  entries: QueuedTaskCommand[],
  context: QueueContext,
): Task[] {
  const result = new Map(
    tasks
      .filter((task) => visible(task, context))
      .map((task) => [task.id, task]),
  );
  for (const entry of entries) {
    if (
      entry.userId !== context.userId ||
      entry.householdId !== context.householdId ||
      entry.status !== "pending"
    )
      continue;
    const command = entry.command;
    if (command.type === "create") {
      const task = taskSchema.safeParse({
        ...command.payload,
        id: command.commandId,
        householdId: context.householdId,
        ownerUserId: context.userId,
        createdBy: context.userId,
        status: "open",
        completedAt: null,
        version: 1,
        createdAt: entry.createdAt,
        updatedAt: entry.createdAt,
      });
      if (task.success) result.set(task.data.id, task.data);
    } else {
      const task = result.get(command.payload.taskId);
      if (!task) continue;
      const changes =
        command.type === "update"
          ? command.payload
          : {
              status: command.payload.status,
              completedAt:
                command.payload.status === "completed" ? entry.createdAt : null,
            };
      const { taskId, expectedVersion, ...fields } = command.payload;
      if (taskId !== task.id || expectedVersion !== task.version) continue;
      const projected = taskSchema.safeParse({
        ...task,
        ...(command.type === "update" ? fields : changes),
      });
      if (projected.success && visible(projected.data, context))
        result.set(task.id, projected.data);
    }
  }
  return [...result.values()];
}
