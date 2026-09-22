import { describe, expect, it } from "vitest";

import { canReadResource, findConflicts } from "./index.js";

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
