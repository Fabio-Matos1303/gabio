import { describe, expect, it } from "vitest";

import {
  canEditResource,
  canReadResource,
  findConflicts,
  nextRecurrenceDueAt,
  parsePortugueseTaskCreate,
} from "./index.js";

describe("canReadResource", () => {
  it("prevents the other household member from reading a private resource", () => {
    expect(
      canReadResource(
        {
          householdId: "household-a",
          ownerUserId: "user-a",
          visibility: "private",
        },
        { householdId: "household-a", userId: "user-b" },
      ),
    ).toBe(false);
  });

  it("allows both members to read a shared resource", () => {
    expect(
      canReadResource(
        {
          householdId: "household-a",
          ownerUserId: "user-a",
          visibility: "household",
        },
        { householdId: "household-a", userId: "user-b" },
      ),
    ).toBe(true);
  });
});

describe("canEditResource", () => {
  const privateTask = {
    householdId: "household-a",
    ownerUserId: "user-a",
    visibility: "private" as const,
  };

  it("allows only the owner to edit a private task", () => {
    expect(
      canEditResource(privateTask, {
        householdId: "household-a",
        userId: "user-a",
      }),
    ).toBe(true);
    expect(
      canEditResource(privateTask, {
        householdId: "household-a",
        userId: "user-b",
      }),
    ).toBe(false);
  });

  it("rejects edits from another household", () => {
    expect(
      canEditResource(
        { ...privateTask, visibility: "household" },
        { householdId: "household-b", userId: "user-a" },
      ),
    ).toBe(false);
  });
});

describe("nextRecurrenceDueAt", () => {
  it.each([
    ["daily", "2026-09-24T10:30:00.000Z"],
    ["weekly", "2026-09-30T10:30:00.000Z"],
  ] as const)("advances a %s recurrence", (recurrence, expected) => {
    expect(
      nextRecurrenceDueAt(
        new Date("2026-09-23T10:30:00.000Z"),
        recurrence,
      )?.toISOString(),
    ).toBe(expected);
  });

  it("clamps monthly recurrence to the last day of a shorter month", () => {
    expect(
      nextRecurrenceDueAt(
        new Date("2027-01-31T10:30:00.000Z"),
        "monthly",
      )?.toISOString(),
    ).toBe("2027-02-28T10:30:00.000Z");
  });

  it("returns null for a non-recurring task", () => {
    expect(
      nextRecurrenceDueAt(new Date("2026-09-23T10:30:00.000Z"), "none"),
    ).toBeNull();
  });
});

describe("parsePortugueseTaskCreate", () => {
  const context = {
    commandId: "00000000-0000-4000-8000-000000000020",
    referenceDate: new Date("2026-09-23T18:45:00.000Z"),
    actorUserId: "00000000-0000-4000-8000-000000000021",
  };

  it("parses a deterministic recurring private task assigned to the actor", () => {
    expect(
      parsePortugueseTaskCreate(
        "Crie uma tarefa: regar as plantas amanhã toda semana, privada, para mim",
        context,
      ),
    ).toEqual({
      commandId: context.commandId,
      type: "create",
      payload: {
        title: "regar as plantas",
        dueAt: "2026-09-24T12:00:00.000Z",
        assigneeUserId: context.actorUserId,
        visibility: "private",
        recurrence: "weekly",
      },
    });
  });

  it("uses safe defaults for a simple household task", () => {
    expect(
      parsePortugueseTaskCreate("Adicionar tarefa comprar café", context)
        ?.payload,
    ).toEqual({
      title: "comprar café",
      dueAt: null,
      assigneeUserId: null,
      visibility: "household",
      recurrence: "none",
    });
  });

  it("declines unsupported text or self-assignment without an actor", () => {
    expect(
      parsePortugueseTaskCreate("talvez comprar café", context),
    ).toBeNull();
    const { actorUserId: _actorUserId, ...anonymousContext } = context;
    expect(
      parsePortugueseTaskCreate(
        "Criar tarefa comprar café para mim",
        anonymousContext,
      ),
    ).toBeNull();
  });
});

describe("findConflicts", () => {
  it("returns only overlapping events", () => {
    const existing = [
      {
        id: "overlap",
        startsAt: new Date("2026-10-08T17:00:00Z"),
        endsAt: new Date("2026-10-08T18:00:00Z"),
      },
      {
        id: "adjacent",
        startsAt: new Date("2026-10-08T18:00:00Z"),
        endsAt: new Date("2026-10-08T19:00:00Z"),
      },
    ];

    expect(
      findConflicts(
        {
          startsAt: new Date("2026-10-08T17:30:00Z"),
          endsAt: new Date("2026-10-08T18:00:00Z"),
        },
        existing,
      ).map((item) => item.id),
    ).toEqual(["overlap"]);
  });
});
