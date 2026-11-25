import { describe, expect, it } from "vitest";
import {
  taskCardCommandSchema,
  taskCardContentSchema,
  taskCardSummarySchema,
} from "./task-card.js";
const taskId = "10000000-0000-4000-8000-000000000001";
const checklistId = "20000000-0000-4000-8000-000000000001";
const item = {
  id: "30000000-0000-4000-8000-000000000001",
  text: "Etapa sintética",
  completed: false,
};
const command = {
  commandId: "40000000-0000-4000-8000-000000000001",
  type: "save_checklist",
  payload: {
    taskId,
    checklistId,
    expectedVersion: 0,
    title: "Etapas",
    items: [item],
  },
};
describe("card contracts", () => {
  it("accepts empty legacy details and validates summaries", () => {
    expect(
      taskCardContentSchema.parse({
        taskId,
        notes: "",
        notesVersion: 0,
        checklists: [],
      }).notesVersion,
    ).toBe(0);
    expect(
      taskCardSummarySchema.safeParse({
        hasNotes: false,
        totalItems: 1,
        completedItems: 2,
      }).success,
    ).toBe(false);
  });
  it("normalizes checklist text and rejects whitespace, duplicates and unknown fields", () => {
    expect(
      taskCardCommandSchema.parse({
        ...command,
        payload: { ...command.payload, title: "  Etapas  " },
      }).payload,
    ).toHaveProperty("title", "Etapas");
    for (const patch of [
      { title: "\n\t" },
      { items: [item, item] },
      { owner: taskId },
      { items: [{ ...item, text: "\n\t" }] },
      { expectedVersion: -1 },
      { items: Array(101).fill(item) },
    ])
      expect(
        taskCardCommandSchema.safeParse({
          ...command,
          payload: { ...command.payload, ...patch },
        }).success,
      ).toBe(false);
  });
  it("bounds notes and supplementary Unicode consistently", () => {
    const notes = {
      commandId: command.commandId,
      type: "save_notes",
      payload: { taskId, expectedVersion: 0, notes: "😀".repeat(5000) },
    };
    expect(taskCardCommandSchema.safeParse(notes).success).toBe(true);
    expect(
      taskCardCommandSchema.safeParse({
        ...notes,
        payload: { ...notes.payload, notes: notes.payload.notes + "a" },
      }).success,
    ).toBe(false);
  });
});
