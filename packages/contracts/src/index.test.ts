import { describe, expect, it } from "vitest";

import {
  authenticatedCommandEnvelopeSchema,
  financeCommandConfirmationSchema,
  financeCommandProposalSchema,
  financeGatewayCommandSchema,
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

describe("financeGatewayCommandSchema", () => {
  const commandId = "00000000-0000-4000-8000-000000000030";
  it("accepts BRL minor units and rejects decimal or foreign amounts", () => {
    const valid = {
      commandId,
      type: "create_transaction",
      payload: {
        accountId: "00000000-0000-4000-8000-000000000031",
        categoryId: null,
        direction: "expense",
        amountMinor: 1099,
        currencyCode: "BRL",
        description: "Compra de teste",
        occurredOn: "2026-09-24",
        visibility: "private",
      },
    };
    expect(financeGatewayCommandSchema.parse(valid).type).toBe(
      "create_transaction",
    );
    expect(() =>
      financeGatewayCommandSchema.parse({
        ...valid,
        payload: { ...valid.payload, amountMinor: 10.99 },
      }),
    ).toThrow();
    expect(() =>
      financeGatewayCommandSchema.parse({
        ...valid,
        payload: { ...valid.payload, currencyCode: "USD" },
      }),
    ).toThrow();
  });
  it("rejects unknown fields and invalid recurrence updates", () => {
    expect(() =>
      financeGatewayCommandSchema.parse({
        commandId,
        type: "reverse_transaction",
        payload: {
          transactionId: "00000000-0000-4000-8000-000000000032",
          reason: "Correção",
          deleteOriginal: true,
        },
      }),
    ).toThrow();
    expect(() =>
      financeGatewayCommandSchema.parse({
        commandId,
        type: "update_recurrence",
        payload: {
          recurrenceId: "00000000-0000-4000-8000-000000000032",
          expectedVersion: 1,
        },
      }),
    ).toThrow();
  });
  it("models installments without a delete command", () => {
    const result = financeGatewayCommandSchema.parse({
      commandId,
      type: "create_installment_plan",
      payload: {
        accountId: "00000000-0000-4000-8000-000000000031",
        categoryId: null,
        description: "Compra parcelada",
        totalAmountMinor: 10001,
        installmentCount: 3,
        currencyCode: "BRL",
        firstDueOn: "2026-10-01",
        visibility: "household",
      },
    });
    expect(result.type).toBe("create_installment_plan");
    expect(
      financeGatewayCommandSchema.options.some((option) =>
        option.shape.type.value.includes("delete"),
      ),
    ).toBe(false);
  });
});

describe("finance confirmation schemas", () => {
  it("requires a strict hash-linked proposal and confirmation", () => {
    const hash = "a".repeat(64);
    expect(
      financeCommandProposalSchema.parse({
        proposalId: "00000000-0000-4000-8000-000000000033",
        commandId: "00000000-0000-4000-8000-000000000030",
        commandHash: hash,
        summary: "Registrar despesa de teste",
        review: {
          operation: "create_transaction",
          description: "Compra de teste",
          amountMinor: "1234",
          visibility: "household",
        },
        expiresAt: "2026-09-24T13:00:00Z",
      }).commandHash,
    ).toBe(hash);
    expect(() =>
      financeCommandConfirmationSchema.parse({
        commandId: "00000000-0000-4000-8000-000000000030",
        proposalId: "00000000-0000-4000-8000-000000000033",
        confirmationHash: "invalid",
      }),
    ).toThrow();
  });
});
