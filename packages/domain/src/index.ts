import {
  taskCreateCommandSchema,
  type TaskGatewayCommand,
  type TaskRecurrence,
  type Visibility,
} from "@gabio/contracts";

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

export function canEditResource(
  resource: OwnedResource,
  actor: { userId: string; householdId: string },
): boolean {
  if (resource.householdId !== actor.householdId) return false;
  return (
    resource.visibility === "household" || resource.ownerUserId === actor.userId
  );
}

export function nextRecurrenceDueAt(
  currentDueAt: Date,
  recurrence: TaskRecurrence,
): Date | null {
  if (Number.isNaN(currentDueAt.getTime()))
    throw new RangeError("Invalid due date");
  if (recurrence === "none") return null;

  const next = new Date(currentDueAt);
  if (recurrence === "daily") next.setUTCDate(next.getUTCDate() + 1);
  if (recurrence === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  if (recurrence === "monthly") {
    const originalDay = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const lastDay = new Date(
      Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
    ).getUTCDate();
    next.setUTCDate(Math.min(originalDay, lastDay));
  }
  return next;
}

type TaskCreateCommand = Extract<TaskGatewayCommand, { type: "create" }>;

export type PortugueseTaskParserContext = Readonly<{
  commandId: string;
  referenceDate: Date;
  actorUserId?: string;
}>;

export function parsePortugueseTaskCreate(
  input: string,
  context: PortugueseTaskParserContext,
): TaskCreateCommand | null {
  const match = input
    .trim()
    .match(
      /^(?:criar|crie|adicionar|adicione)\s+(?:uma\s+)?tarefa\s*:?[ \t]+(.+)$/iu,
    );
  if (!match?.[1] || Number.isNaN(context.referenceDate.getTime())) return null;

  let title = match[1].trim();
  let recurrence: TaskRecurrence = "none";
  const recurrencePatterns: readonly [RegExp, TaskRecurrence][] = [
    [/\b(?:todo|todos os)\s+dias?\b/iu, "daily"],
    [/\b(?:toda|a cada)\s+semana\b/iu, "weekly"],
    [/\b(?:todo|a cada)\s+m[eê]s\b/iu, "monthly"],
  ];
  for (const [pattern, value] of recurrencePatterns) {
    if (pattern.test(title)) {
      recurrence = value;
      title = title.replace(pattern, " ");
      break;
    }
  }

  const privatePattern = /\b(?:privada|privado)\b/iu;
  const visibility: Visibility = privatePattern.test(title)
    ? "private"
    : "household";
  title = title.replace(privatePattern, " ");

  const selfPattern = /\bpara\s+mim\b/iu;
  const assignedToSelf = selfPattern.test(title);
  title = title.replace(selfPattern, " ");
  if (assignedToSelf && !context.actorUserId) return null;

  let dueAt: string | null = null;
  // JavaScript word boundaries are ASCII-oriented even with the Unicode flag,
  // so accented Portuguese words need explicit whitespace/punctuation limits.
  const tomorrowPattern = /(?:^|\s)amanhã(?=\s|[,.;]|$)/iu;
  if (tomorrowPattern.test(title)) {
    const tomorrow = new Date(context.referenceDate);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(12, 0, 0, 0);
    dueAt = tomorrow.toISOString();
    title = title.replace(tomorrowPattern, " ");
  }

  title = title
    .replace(/\s+/gu, " ")
    .replace(/^[,;:\-\s]+|[,;:\-\s]+$/gu, "")
    .trim();
  const parsed = taskCreateCommandSchema.safeParse({
    commandId: context.commandId,
    type: "create",
    payload: {
      title,
      dueAt,
      assigneeUserId: assignedToSelf ? context.actorUserId : null,
      visibility,
      recurrence,
    },
  });
  return parsed.success ? parsed.data : null;
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
