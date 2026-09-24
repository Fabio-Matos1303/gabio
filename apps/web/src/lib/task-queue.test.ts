import type { TaskGatewayCommand } from "@gabio/contracts";
import { describe, expect, it, vi } from "vitest";

import type { AppGateway } from "./app-gateway.js";
import { GatewayError } from "./app-gateway.js";
import { MemoryTaskCommandQueue, syncTaskCommandQueue } from "./task-queue.js";

const contextA = {
  userId: "10000000-0000-4000-8000-000000000001",
  householdId: "20000000-0000-4000-8000-000000000001",
};
const contextB = {
  userId: "10000000-0000-4000-8000-000000000002",
  householdId: "20000000-0000-4000-8000-000000000002",
};
const command: TaskGatewayCommand = {
  commandId: "30000000-0000-4000-8000-000000000001",
  type: "create",
  payload: {
    title: "Comprar pão",
    dueAt: null,
    assigneeUserId: null,
    visibility: "household",
    recurrence: "none",
  },
};

describe("task command queue", () => {
  it("partitions commands by user and household and preserves commandId", async () => {
    const queue = new MemoryTaskCommandQueue();
    await queue.put(contextA, command);

    expect(await queue.list(contextB)).toEqual([]);
    expect((await queue.list(contextA))[0]?.command.commandId).toBe(
      command.commandId,
    );
  });

  it("does not send a previous session queue after logout or context change", async () => {
    const queue = new MemoryTaskCommandQueue();
    await queue.put(contextA, command);
    const executeTaskCommand = vi.fn();
    const gateway = { executeTaskCommand } as unknown as AppGateway;

    await syncTaskCommandQueue(queue, gateway, contextA, () => false);

    expect(executeTaskCommand).not.toHaveBeenCalled();
    expect(await queue.list(contextA)).toHaveLength(1);
  });

  it("keeps a command when the session changes during its request", async () => {
    const queue = new MemoryTaskCommandQueue();
    await queue.put(contextA, command);
    let current = true;
    const gateway = {
      executeTaskCommand: vi.fn().mockImplementation(async () => {
        current = false;
      }),
    } as unknown as AppGateway;

    await syncTaskCommandQueue(queue, gateway, contextA, () => current);

    expect(await queue.list(contextA)).toHaveLength(1);
  });

  it("removes only a command confirmed by the gateway", async () => {
    const queue = new MemoryTaskCommandQueue();
    await queue.put(contextA, command);
    const gateway = {
      executeTaskCommand: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppGateway;

    await syncTaskCommandQueue(queue, gateway, contextA, () => true);

    expect(gateway.executeTaskCommand).toHaveBeenCalledWith(command);
    expect(await queue.list(contextA)).toEqual([]);
  });

  it("keeps an unknown failure pending for an idempotent retry", async () => {
    const queue = new MemoryTaskCommandQueue();
    await queue.put(contextA, command);
    const gateway = {
      executeTaskCommand: vi.fn().mockRejectedValue(new Error("offline")),
    } as unknown as AppGateway;
    await syncTaskCommandQueue(queue, gateway, contextA, () => true);
    expect((await queue.list(contextA))[0]?.status).toBe("pending");
  });

  it("marks optimistic concurrency failures as conflicts", async () => {
    const queue = new MemoryTaskCommandQueue();
    await queue.put(contextA, command);
    const gateway = {
      executeTaskCommand: vi
        .fn()
        .mockRejectedValue(new GatewayError("stale", "conflict")),
    } as unknown as AppGateway;
    await syncTaskCommandQueue(queue, gateway, contextA, () => true);
    expect((await queue.list(contextA))[0]?.status).toBe("conflict");
  });
});
