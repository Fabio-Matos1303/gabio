import {
  taskGatewayCommandSchema,
  type TaskGatewayCommand,
} from "@gabio/contracts";
import { z } from "zod";

import type { AppGateway } from "./app-gateway.js";
import { GatewayError } from "./app-gateway.js";

const queueStatusSchema = z.enum(["pending", "conflict", "failed"]);
export type QueueStatus = z.infer<typeof queueStatusSchema>;
const queuedTaskCommandSchema = z
  .object({
    key: z.string().min(1),
    userId: z.string().uuid(),
    householdId: z.string().uuid(),
    command: taskGatewayCommandSchema,
    status: queueStatusSchema,
    createdAt: z.string().datetime({ offset: true }),
    message: z.string().max(240).nullable(),
  })
  .strict();
export type QueuedTaskCommand = z.infer<typeof queuedTaskCommandSchema>;
export type QueueContext = Readonly<{ userId: string; householdId: string }>;

export interface TaskCommandQueue {
  put(context: QueueContext, command: TaskGatewayCommand): Promise<void>;
  list(context: QueueContext): Promise<QueuedTaskCommand[]>;
  update(
    context: QueueContext,
    commandId: string,
    status: QueueStatus,
    message: string | null,
  ): Promise<void>;
  remove(context: QueueContext, commandId: string): Promise<void>;
}

const queueKey = (context: QueueContext, commandId: string) =>
  `${context.userId}:${context.householdId}:${commandId}`;

export class IndexedDbTaskCommandQueue implements TaskCommandQueue {
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("gabio-task-commands-v1", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("commands"))
          request.result.createObjectStore("commands", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async transaction<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ) {
    const database = await this.open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const transaction = database.transaction("commands", mode);
        const request = operation(transaction.objectStore("commands"));
        transaction.oncomplete = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }

  async put(context: QueueContext, command: TaskGatewayCommand) {
    const parsedCommand = taskGatewayCommandSchema.parse(command);
    const entry = queuedTaskCommandSchema.parse({
      key: queueKey(context, parsedCommand.commandId),
      ...context,
      command: parsedCommand,
      status: "pending",
      createdAt: new Date().toISOString(),
      message: null,
    });
    await this.transaction("readwrite", (store) => store.put(entry));
  }
  async list(context: QueueContext) {
    const records = await this.transaction("readonly", (store) =>
      store.getAll(),
    );
    return z
      .array(queuedTaskCommandSchema)
      .parse(records)
      .filter(
        (entry) =>
          entry.userId === context.userId &&
          entry.householdId === context.householdId,
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async update(
    context: QueueContext,
    commandId: string,
    status: QueueStatus,
    message: string | null,
  ) {
    const existing = await this.transaction("readonly", (store) =>
      store.get(queueKey(context, commandId)),
    );
    const parsed = queuedTaskCommandSchema.safeParse(existing);
    if (parsed.success)
      await this.transaction("readwrite", (store) =>
        store.put({ ...parsed.data, status, message }),
      );
  }
  async remove(context: QueueContext, commandId: string) {
    await this.transaction("readwrite", (store) =>
      store.delete(queueKey(context, commandId)),
    );
  }
}

export class MemoryTaskCommandQueue implements TaskCommandQueue {
  private readonly entries = new Map<string, QueuedTaskCommand>();

  async put(context: QueueContext, command: TaskGatewayCommand) {
    const parsed = taskGatewayCommandSchema.parse(command);
    const entry = queuedTaskCommandSchema.parse({
      key: queueKey(context, parsed.commandId),
      ...context,
      command: parsed,
      status: "pending",
      createdAt: new Date().toISOString(),
      message: null,
    });
    this.entries.set(entry.key, entry);
  }

  async list(context: QueueContext) {
    return [...this.entries.values()].filter(
      (entry) =>
        entry.userId === context.userId &&
        entry.householdId === context.householdId,
    );
  }

  async update(
    context: QueueContext,
    commandId: string,
    status: QueueStatus,
    message: string | null,
  ) {
    const key = queueKey(context, commandId);
    const entry = this.entries.get(key);
    if (entry) this.entries.set(key, { ...entry, status, message });
  }

  async remove(context: QueueContext, commandId: string) {
    this.entries.delete(queueKey(context, commandId));
  }
}

export function createTaskCommandQueue(): TaskCommandQueue {
  return typeof indexedDB === "undefined"
    ? new MemoryTaskCommandQueue()
    : new IndexedDbTaskCommandQueue();
}

export async function syncTaskCommandQueue(
  queue: TaskCommandQueue,
  gateway: AppGateway,
  context: QueueContext,
  isCurrentContext: () => boolean,
) {
  for (const entry of await queue.list(context)) {
    if (!isCurrentContext()) return;
    if (entry.status !== "pending") continue;
    try {
      await gateway.executeTaskCommand(entry.command);
      if (!isCurrentContext()) return;
      await queue.remove(context, entry.command.commandId);
    } catch (error) {
      if (!isCurrentContext()) return;
      const conflict =
        error instanceof GatewayError && error.kind === "conflict";
      if (conflict)
        await queue.update(
          context,
          entry.command.commandId,
          "conflict",
          "A tarefa mudou em outro dispositivo.",
        );

      // Unknown failures may mean that the server committed the command but the
      // response was lost. Keep the same commandId pending for an idempotent replay.
      return;
    }
  }
}
