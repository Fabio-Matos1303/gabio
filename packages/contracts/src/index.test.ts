import { describe, expect, it } from "vitest";

import {
  authenticatedCommandEnvelopeSchema,
  incomingCommandSchema,
  interpretationSchema,
  proposedCommandSchema,
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
