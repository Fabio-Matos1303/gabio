import { describe, expect, it, vi } from "vitest";
import {
  MemoryCardCommandQueue,
  syncCardCommandQueue,
} from "./task-card-queue.js";
import { GatewayError, type AppGateway } from "./app-gateway.js";
import type { TaskCardCommand } from "@gabio/contracts";
const context = {
  userId: "10000000-0000-4000-8000-000000000001",
  householdId: "20000000-0000-4000-8000-000000000001",
};
const command: TaskCardCommand = {
  commandId: "30000000-0000-4000-8000-000000000001",
  type: "save_notes",
  payload: {
    taskId: "40000000-0000-4000-8000-000000000001",
    expectedVersion: 0,
    notes: "Nota sintética",
  },
};
describe("card command queue", () => {
  it("retains the exact command after response loss and removes only after acknowledgement", async () => {
    const queue = new MemoryCardCommandQueue();
    await queue.put(context, command);
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({});
    const gateway = { executeTaskCardCommand: send } as unknown as AppGateway;
    await syncCardCommandQueue(queue, gateway, context, () => true);
    expect((await queue.list(context))[0]?.command).toEqual(command);
    await syncCardCommandQueue(queue, gateway, context, () => true);
    expect(send.mock.calls[0]?.[0]).toEqual(send.mock.calls[1]?.[0]);
    expect(await queue.list(context)).toEqual([]);
  });
  it("isolates identities and preserves explicit conflicts without retry", async () => {
    const queue = new MemoryCardCommandQueue();
    await queue.put(context, command);
    expect(
      await queue.list({ ...context, userId: crypto.randomUUID() }),
    ).toEqual([]);
    const send = vi
      .fn()
      .mockRejectedValue(new GatewayError(undefined, "conflict"));
    const gateway = { executeTaskCardCommand: send } as unknown as AppGateway;
    await syncCardCommandQueue(queue, gateway, context, () => true);
    expect((await queue.list(context))[0]?.status).toBe("conflict");
    await syncCardCommandQueue(queue, gateway, context, () => true);
    expect(send).toHaveBeenCalledTimes(1);
    await syncCardCommandQueue(queue, gateway, context, () => false);
    expect(await queue.list(context)).toHaveLength(1);
  });
});
