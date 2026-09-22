import { z } from "zod";

export const visibilitySchema = z.enum(["household", "private"]);
export type Visibility = z.infer<typeof visibilitySchema>;

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
  })
  .strict();

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
