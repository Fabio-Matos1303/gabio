import { z } from "zod";

// Keep HTML maxlength, PostgreSQL and contracts aligned on UTF-16 code units.
const notesSchema = z
  .string()
  .max(10000)
  .refine((value) => value.length <= 10000);
const titleSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => value.length <= 120);
const itemTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => value.length <= 500);

export const taskCardSummarySchema = z
  .object({
    hasNotes: z.boolean(),
    totalItems: z.number().int().min(0).max(2000),
    completedItems: z.number().int().min(0).max(2000),
  })
  .strict()
  .refine((v) => v.completedItems <= v.totalItems);

export const checklistItemSchema = z
  .object({
    id: z.string().uuid(),
    text: itemTextSchema,
    completed: z.boolean(),
  })
  .strict();
const checklistItemsSchema = z
  .array(checklistItemSchema)
  .max(100)
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length);
export const taskChecklistSchema = z
  .object({
    id: z.string().uuid(),
    title: titleSchema,
    version: z.number().int().positive(),
    items: checklistItemsSchema,
  })
  .strict();
export const taskCardContentSchema = z
  .object({
    taskId: z.string().uuid(),
    notes: notesSchema,
    notesVersion: z.number().int().nonnegative(),
    checklists: z.array(taskChecklistSchema).max(20),
  })
  .strict();
const identity = {
  taskId: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative().max(2147483646),
};
export const taskCardCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      commandId: z.string().uuid(),
      type: z.literal("save_notes"),
      payload: z.object({ ...identity, notes: notesSchema }).strict(),
    })
    .strict(),
  z
    .object({
      commandId: z.string().uuid(),
      type: z.literal("save_checklist"),
      payload: z
        .object({
          ...identity,
          checklistId: z.string().uuid(),
          title: titleSchema,
          items: checklistItemsSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      commandId: z.string().uuid(),
      type: z.literal("delete_checklist"),
      payload: z
        .object({
          ...identity,
          expectedVersion: z.number().int().positive().max(2147483646),
          checklistId: z.string().uuid(),
        })
        .strict(),
    })
    .strict(),
]);
export const taskCardReceiptSchema = z
  .object({
    commandId: z.string().uuid(),
    replayed: z.boolean(),
    taskId: z.string().uuid(),
  })
  .strict();
export type TaskCardContent = z.infer<typeof taskCardContentSchema>;
export type TaskChecklist = z.infer<typeof taskChecklistSchema>;
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type TaskCardCommand = z.infer<typeof taskCardCommandSchema>;
export type TaskCardReceipt = z.infer<typeof taskCardReceiptSchema>;
