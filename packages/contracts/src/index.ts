import { z } from "zod";

export const visibilitySchema = z.enum(["household", "private"]);
export type Visibility = z.infer<typeof visibilitySchema>;

export const taskRecurrenceSchema = z.enum([
  "none",
  "daily",
  "weekly",
  "monthly",
]);
export type TaskRecurrence = z.infer<typeof taskRecurrenceSchema>;

export const taskStatusSchema = z.enum(["open", "completed", "cancelled"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const commandSourceSchema = z.enum([
  "pwa",
  "telegram",
  "local-agent",
  "scheduler",
]);

const taskPayloadSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    dueAt: z.string().datetime({ offset: true }).nullable().default(null),
    assigneeUserId: z.string().uuid().nullable().default(null),
    visibility: visibilitySchema.default("household"),
    recurrence: taskRecurrenceSchema.default("none"),
  })
  .strict();

const taskMutableFieldsSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    dueAt: z.string().datetime({ offset: true }).nullable(),
    assigneeUserId: z.string().uuid().nullable(),
    visibility: visibilitySchema,
    recurrence: taskRecurrenceSchema,
  })
  .strict();

const taskCreatePayloadSchema = taskMutableFieldsSchema.superRefine(
  (payload, context) => {
    if (payload.recurrence !== "none" && payload.dueAt === null)
      context.addIssue({
        code: "custom",
        message: "recurring tasks require dueAt",
        path: ["dueAt"],
      });
  },
);

const taskUpdatePayloadSchema = taskMutableFieldsSchema
  .partial()
  .extend({
    taskId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
  })
  .strict()
  .refine(
    ({ taskId: _taskId, expectedVersion: _expectedVersion, ...changes }) =>
      Object.keys(changes).length > 0,
    { message: "at least one task field must be updated" },
  );

export const taskCreateCommandSchema = z
  .object({
    commandId: z.string().uuid(),
    type: z.literal("create"),
    payload: taskCreatePayloadSchema,
  })
  .strict();
export const taskUpdateCommandSchema = z
  .object({
    commandId: z.string().uuid(),
    type: z.literal("update"),
    payload: taskUpdatePayloadSchema,
  })
  .strict();
export const taskSetStatusCommandSchema = z
  .object({
    commandId: z.string().uuid(),
    type: z.literal("set_status"),
    payload: z
      .object({
        taskId: z.string().uuid(),
        expectedVersion: z.number().int().positive(),
        status: taskStatusSchema,
      })
      .strict(),
  })
  .strict();
export const taskGatewayCommandSchema = z.discriminatedUnion("type", [
  taskCreateCommandSchema,
  taskUpdateCommandSchema,
  taskSetStatusCommandSchema,
]);
export type TaskGatewayCommand = z.infer<typeof taskGatewayCommandSchema>;

export const taskSchema = z
  .object({
    id: z.string().uuid(),
    householdId: z.string().uuid(),
    ownerUserId: z.string().uuid().nullable(),
    createdBy: z.string().uuid(),
    assigneeUserId: z.string().uuid().nullable(),
    title: z.string().trim().min(1).max(240),
    dueAt: z.string().datetime({ offset: true }).nullable(),
    visibility: visibilitySchema,
    recurrence: taskRecurrenceSchema,
    status: taskStatusSchema,
    completedAt: z.string().datetime({ offset: true }).nullable(),
    version: z.number().int().positive(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((task, context) => {
    if (task.visibility === "private" && task.ownerUserId === null)
      context.addIssue({
        code: "custom",
        message: "private tasks require an owner",
        path: ["ownerUserId"],
      });
    if (
      task.visibility === "private" &&
      task.assigneeUserId !== null &&
      task.assigneeUserId !== task.ownerUserId
    )
      context.addIssue({
        code: "custom",
        message: "private tasks cannot be assigned to another user",
        path: ["assigneeUserId"],
      });
    if (task.recurrence !== "none" && task.dueAt === null)
      context.addIssue({
        code: "custom",
        message: "recurring tasks require dueAt",
        path: ["dueAt"],
      });
    if (task.status === "completed" && task.completedAt === null)
      context.addIssue({
        code: "custom",
        message: "completed tasks require completedAt",
        path: ["completedAt"],
      });
  });
export type Task = z.infer<typeof taskSchema>;
export const taskCommandReceiptSchema = z
  .object({
    commandId: z.string().uuid(),
    replayed: z.boolean(),
    task: taskSchema,
  })
  .strict();
export type TaskCommandReceipt = z.infer<typeof taskCommandReceiptSchema>;
export const taskCommandResponseSchema = taskCommandReceiptSchema;
export type TaskCommandResponse = TaskCommandReceipt;

const transactionPayloadSchema = z
  .object({
    accountId: z.string().uuid(),
    direction: z.enum(["income", "expense"]),
    amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    currencyCode: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default("BRL"),
    occurredOn: z.string().date(),
    description: z.string().trim().min(1).max(500),
  })
  .strict();

const calendarEventPayloadSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    timezone: z.string().default("America/Bahia"),
  })
  .strict()
  .refine((value) => Date.parse(value.startsAt) < Date.parse(value.endsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

export const proposedCommandSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("task.create"), payload: taskPayloadSchema })
    .strict(),
  z
    .object({
      type: z.literal("finance.transaction.create"),
      payload: transactionPayloadSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("calendar.event.create"),
      payload: calendarEventPayloadSchema,
    })
    .strict(),
]);

export type ProposedCommand = z.infer<typeof proposedCommandSchema>;

// The only command parser intended for untrusted clients and model output.
// Identity, household and source are deliberately absent.
export const incomingCommandSchema = proposedCommandSchema;
export type IncomingCommand = z.infer<typeof incomingCommandSchema>;

export const interpretationSchema = z
  .object({
    proposal: proposedCommandSchema.nullable(),
    confidence: z.number().min(0).max(1),
    missingFields: z.array(z.string()).default([]),
    clarificationQuestion: z.string().trim().min(1).nullable().default(null),
  })
  .strict();

export type Interpretation = z.infer<typeof interpretationSchema>;

export const confirmationReceiptSchema = z
  .object({
    confirmationId: z.string().uuid(),
    confirmedBy: z.string().uuid(),
    expiresAt: z.string().datetime({ offset: true }),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

// Internal-only: the gateway derives identity and scope from the authenticated session.
export const authenticatedCommandEnvelopeSchema = z
  .object({
    commandId: z.string().uuid(),
    actorUserId: z.string().uuid(),
    householdId: z.string().uuid(),
    source: commandSourceSchema,
    occurredAt: z.string().datetime({ offset: true }),
    command: proposedCommandSchema,
    confirmation: confirmationReceiptSchema.nullable().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.command.type === "finance.transaction.create" &&
      value.confirmation === null
    ) {
      context.addIssue({
        code: "custom",
        message: "financial commands require confirmation",
        path: ["confirmation"],
      });
    }
  });

export type AuthenticatedCommandEnvelope = z.infer<
  typeof authenticatedCommandEnvelopeSchema
>;
