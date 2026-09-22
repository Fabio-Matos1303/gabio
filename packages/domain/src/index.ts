import type { Visibility } from "@gabio/contracts";

export type OwnedResource = {
  householdId: string;
  ownerUserId: string | null;
  visibility: Visibility;
};

export function canReadResource(
  resource: OwnedResource,
  actor: { userId: string; householdId: string },
): boolean {
  if (resource.householdId !== actor.householdId) return false;
  return (
    resource.visibility === "household" || resource.ownerUserId === actor.userId
  );
}

export type TimeInterval = {
  startsAt: Date;
  endsAt: Date;
};

export function intervalsOverlap(
  left: TimeInterval,
  right: TimeInterval,
): boolean {
  return left.startsAt < right.endsAt && right.startsAt < left.endsAt;
}

export function findConflicts<T extends TimeInterval>(
  proposed: TimeInterval,
  existing: readonly T[],
): T[] {
  if (proposed.startsAt >= proposed.endsAt) {
    throw new RangeError("The proposed interval must end after it starts");
  }

  return existing.filter((item) => intervalsOverlap(proposed, item));
}
