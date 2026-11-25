import { describe, expect, it } from "vitest";
import { taskUpdateCommandSchema } from "./index.js";
const command = {
  commandId: "71000000-0000-4000-8000-000000000001",
  type: "update",
  payload: {
    taskId: "72000000-0000-4000-8000-000000000001",
    expectedVersion: 1,
    priority: "high",
  },
};
describe("task priority commands", () => {
  it.each(["low", "medium", "high"])("accepts priority %s", (priority) => {
    expect(
      taskUpdateCommandSchema.safeParse({
        ...command,
        payload: { ...command.payload, priority },
      }).success,
    ).toBe(true);
  });
  it.each([null, "urgent", 3, {}, ""])(
    "rejects invalid priority %j",
    (priority) => {
      expect(
        taskUpdateCommandSchema.safeParse({
          ...command,
          payload: { ...command.payload, priority },
        }).success,
      ).toBe(false);
    },
  );
  it("rejects mixing priority and other property changes", () => {
    expect(
      taskUpdateCommandSchema.safeParse({
        ...command,
        payload: { ...command.payload, title: "Outro título" },
      }).success,
    ).toBe(false);
  });
});
