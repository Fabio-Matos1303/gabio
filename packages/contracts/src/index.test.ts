import { describe, expect, it } from "vitest";

import {
  authenticatedCommandEnvelopeSchema,
  incomingCommandSchema,
  interpretationSchema,
  proposedCommandSchema,
  taskCommandReceiptSchema,
  taskGatewayCommandSchema,
} from "./index.js";

describe("proposedCommandSchema", () => {
  it("accepts a valid private task", () => {
    const result = proposedCommandSchema.parse({
      type: "task.create",
      payload: {
        title: "Pagar condomínio",
        dueAt: "2026-10-08T12:00:00-03:00",
        assigneeUserId: null,
        visibility: "private",
      },
    });

    expect(result.type).toBe("task.create");
  });

  it("rejects an event with an invalid interval", () => {
    expect(() =>
      proposedCommandSchema.parse({
        type: "calendar.event.create",
        payload: {
          title: "Dentista",
          startsAt: "2026-10-08T15:00:00-03:00",
          endsAt: "2026-10-08T14:00:00-03:00",
          timezone: "America/Bahia",
        },
      }),
    ).toThrow();
  });

  it("rejects privileged fields and invalid currency casing", () => {
    expect(() =>
      incomingCommandSchema.parse({
        type: "finance.transaction.create",
        actorUserId: "00000000-0000-4000-8000-000000000001",
        payload: {
          accountId: "00000000-0000-4000-8000-000000000002",
          direction: "expense",
          amountMinor: 100,
          currencyCode: "brl",
          occurredOn: "2026-09-22",
          description: "Mercado",
        },
      }),
    ).toThrow();
  });

  it("requires a confirmation receipt for financial execution", () => {
    expect(() =>
      authenticatedCommandEnvelopeSchema.parse({
        commandId: "00000000-0000-4000-8000-000000000003",
        actorUserId: "00000000-0000-4000-8000-000000000001",
        householdId: "00000000-0000-4000-8000-000000000004",
        source: "pwa",
        occurredAt: "2026-09-22T12:00:00-03:00",
        command: {
          type: "finance.transaction.create",
          payload: {
            accountId: "00000000-0000-4000-8000-000000000002",
            direction: "expense",
            amountMinor: 100,
            currencyCode: "BRL",
            occurredOn: "2026-09-22",
            description: "Mercado",
          },
        },
      }),
    ).toThrow(/confirmation/);
  });
});

describe("taskGatewayCommandSchema", () => {
  it("accepts a strict create command", () => {
    expect(
      taskGatewayCommandSchema.parse({
        commandId: "00000000-0000-4000-8000-000000000010",
        type: "create",
        payload: {
          title: "Regar as plantas",
          dueAt: "2026-10-08T12:00:00-03:00",
          assigneeUserId: null,
          visibility: "household",
          recurrence: "weekly",
        },
      }).type,
    ).toBe("create");
  });
  it("requires a due date for recurring tasks", () => {
    expect(() =>
      taskGatewayCommandSchema.parse({
        commandId: "00000000-0000-4000-8000-000000000015",
        type: "create",
        payload: {
          title: "Regar as plantas",
          dueAt: null,
          assigneeUserId: null,
          visibility: "household",
          recurrence: "weekly",
        },
      }),
    ).toThrow();
  });
  it("requires optimistic concurrency and actual changes for updates", () => {
    expect(() =>
      taskGatewayCommandSchema.parse({
        commandId: "00000000-0000-4000-8000-000000000011",
        type: "update",
        payload: {
          taskId: "00000000-0000-4000-8000-000000000012",
          title: "Novo título",
        },
      }),
    ).toThrow();
    expect(() =>
      taskGatewayCommandSchema.parse({
        commandId: "00000000-0000-4000-8000-000000000011",
        type: "update",
        payload: {
          taskId: "00000000-0000-4000-8000-000000000012",
          expectedVersion: 1,
        },
      }),
    ).toThrow(/at least one/);
  });
  it("rejects privileged fields", () => {
    expect(() =>
      taskGatewayCommandSchema.parse({
        commandId: "00000000-0000-4000-8000-000000000011",
        type: "set_status",
        payload: {
          taskId: "00000000-0000-4000-8000-000000000012",
          expectedVersion: 1,
          status: "completed",
          actorUserId: "00000000-0000-4000-8000-000000000013",
        },
      }),
    ).toThrow();
  });
  it("validates a versioned task receipt", () => {
    const result = taskCommandReceiptSchema.parse({
      commandId: "00000000-0000-4000-8000-000000000010",
      replayed: false,
      task: {
        id: "00000000-0000-4000-8000-000000000012",
        householdId: "00000000-0000-4000-8000-000000000014",
        ownerUserId: null,
        createdBy: "00000000-0000-4000-8000-000000000013",
        assigneeUserId: null,
        title: "Regar as plantas",
        dueAt: "2026-10-08T12:00:00-03:00",
        visibility: "household",
        recurrence: "weekly",
        status: "open",
        completedAt: null,
        version: 1,
        createdAt: "2026-09-23T12:00:00-03:00",
        updatedAt: "2026-09-23T12:00:00-03:00",
      },
    });
    expect(result.task.version).toBe(1);
  });
});

describe("interpretationSchema", () => {
  it("requires confidence between zero and one", () => {
    expect(() =>
      interpretationSchema.parse({
        proposal: null,
        confidence: 2,
        missingFields: [],
        clarificationQuestion: "Qual conta devo usar?",
      }),
    ).toThrow();
  });
});
