import {
  GoogleCalendarProvider,
  ProviderError,
  parseStoredTokens,
  projectTask,
  seal,
  unseal,
} from "./google-calendar-provider.ts";
import type { Rpc, CalendarConfig } from "./google-calendar-service.ts";
type Job = {
  jobId: string;
  leaseToken: string;
  connectionId: string;
  userId: string;
  householdId: string;
  tokenCipher: string;
  action: "upsert" | "delete" | "revoke";
  task: {
    id: string;
    title: string;
    dueAt: string;
    status: string;
    version: number;
  } | null;
  calendarId: string | null;
  targetKind: "household" | "private" | null;
  targetState: "missing" | "creating" | "ready";
  eventId: string | null;
  etag: string | null;
  reminderMinutes: number | null;
  attempts: number;
};
function parseJob(value: unknown): Job {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid job");
  const row = value as Record<string, unknown>;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    !["jobId", "leaseToken", "connectionId", "userId", "householdId"].every(
      (k) => typeof row[k] === "string" && uuid.test(row[k] as string),
    ) ||
    typeof row.tokenCipher !== "string" ||
    !["upsert", "delete", "revoke"].includes(String(row.action)) ||
    !["missing", "creating", "ready"].includes(String(row.targetState)) ||
    !(row.calendarId === null || typeof row.calendarId === "string") ||
    !(
      row.targetKind === null ||
      row.targetKind === "household" ||
      row.targetKind === "private"
    ) ||
    !(
      row.eventId === null ||
      (typeof row.eventId === "string" &&
        /^[a-v0-9]{5,1024}$/.test(row.eventId))
    ) ||
    !(row.etag === null || typeof row.etag === "string") ||
    !(
      row.reminderMinutes === null ||
      (typeof row.reminderMinutes === "number" &&
        Number.isInteger(row.reminderMinutes) &&
        row.reminderMinutes >= 0 &&
        row.reminderMinutes <= 10080)
    ) ||
    typeof row.attempts !== "number" ||
    !Number.isSafeInteger(row.attempts) ||
    row.attempts < 0
  )
    throw new Error("invalid job");
  if (row.action === "upsert") {
    const task = row.task as Record<string, unknown> | null;
    if (
      !task ||
      typeof task !== "object" ||
      !uuid.test(String(task.id)) ||
      typeof task.title !== "string" ||
      task.title.length > 240 ||
      typeof task.dueAt !== "string" ||
      !Number.isFinite(Date.parse(task.dueAt)) ||
      typeof task.version !== "number" ||
      !Number.isSafeInteger(task.version) ||
      !["open", "in_progress", "completed"].includes(String(task.status)) ||
      !row.eventId ||
      !row.targetKind
    )
      throw new Error("invalid task");
  }
  return row as Job;
}
async function equalSecret(
  received: string,
  expected: string,
): Promise<boolean> {
  if (expected.length < 32 || received.length > 256) return false;
  const digest = async (value: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    );
  const a = await digest(received);
  const b = await digest(expected);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}
export function createCalendarWorker(deps: {
  config: CalendarConfig;
  workerSecret: string;
  rpc: Rpc;
  provider?: GoogleCalendarProvider;
}) {
  const provider = deps.provider ?? new GoogleCalendarProvider();
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST")
      return respond({ error: "Método não permitido." }, 405);
    const authorization = request.headers.get("authorization") ?? "";
    if (
      !authorization.startsWith("Bearer ") ||
      !(await equalSecret(authorization.slice(7), deps.workerSecret))
    )
      return respond({ error: "Não autorizado." }, 401);
    if (!deps.config.enabled) return respond({ enabled: false, processed: 0 });
    if (
      !deps.config.clientId ||
      !deps.config.clientSecret ||
      !deps.config.encryptionKey ||
      !deps.config.appUrl
    )
      return respond({ error: "Integração indisponível." }, 503);
    let jobs: unknown;
    try {
      jobs = await deps.rpc("gc_claim_jobs", { batch_size: 2 });
    } catch {
      return respond({ error: "Fila indisponível." }, 503);
    }
    if (!Array.isArray(jobs) || jobs.length > 2)
      return respond({ error: "Fila inválida." }, 503);
    let processed = 0;
    let failed = 0;
    for (const raw of jobs) {
      let job: Job;
      try {
        job = parseJob(raw);
      } catch {
        failed++;
        continue;
      }
      try {
        const validated = await deps.rpc("gc_validate_job", {
          job_id: job.jobId,
          lease_token: job.leaseToken,
        });
        if (validated === null) continue;
        job = parseJob(validated);
        let tokens = parseStoredTokens(
          await unseal(
            job.tokenCipher,
            deps.config.encryptionKey,
            `${job.userId}:${job.householdId}`,
          ),
        );
        if (job.action === "revoke") {
          await provider.revoke(tokens.refreshToken);
          await deps.rpc("gc_finish_job", {
            job_id: job.jobId,
            lease_token: job.leaseToken,
            result: { status: "deleted" },
          });
          processed++;
          continue;
        }
        if (tokens.expiresAt - Date.now() < 60_000) {
          tokens = await provider.refresh(
            deps.config.clientId,
            deps.config.clientSecret,
            tokens,
          );
          const nextCipher = await seal(
            tokens,
            deps.config.encryptionKey,
            `${job.userId}:${job.householdId}`,
          );
          await deps.rpc("gc_update_token", {
            connection_id: job.connectionId,
            token_cipher: nextCipher,
            previous_cipher: job.tokenCipher,
            job_id: job.jobId,
            lease_token: job.leaseToken,
          });
          job.tokenCipher = nextCipher;
        }
        if (job.action === "delete") {
          if (job.calendarId && job.eventId)
            await provider.removeEvent(
              tokens.accessToken,
              job.calendarId,
              job.eventId,
            );
          await deps.rpc("gc_finish_job", {
            job_id: job.jobId,
            lease_token: job.leaseToken,
            result: { status: "deleted" },
          });
          processed++;
          continue;
        }
        if (!job.task || !job.eventId || !job.targetKind)
          throw new ProviderError("invalid_response");
        let calendarId = job.calendarId;
        if (!calendarId) {
          if (job.targetState === "creating")
            throw new ProviderError("calendar_creation_uncertain");
          await deps.rpc("gc_set_target", {
            job_id: job.jobId,
            lease_token: job.leaseToken,
            calendar_id: null,
          });
          calendarId = await provider.createCalendar(
            tokens.accessToken,
            job.targetKind,
          );
          // Persist before any event insertion. A failure leaves target creating, blocking ambiguous retries.
          await deps.rpc("gc_set_target", {
            job_id: job.jobId,
            lease_token: job.leaseToken,
            calendar_id: calendarId,
          });
        }
        const latest = await deps.rpc("gc_validate_job", {
          job_id: job.jobId,
          lease_token: job.leaseToken,
        });
        if (latest === null) continue;
        const latestJob = parseJob(latest);
        if (latestJob.tokenCipher !== job.tokenCipher)
          throw new ProviderError("unavailable", true);
        job = latestJob;
        if (job.action !== "upsert" || !job.task || !job.eventId) continue;
        let etag: string;
        try {
          etag = await provider.putEvent(
            tokens.accessToken,
            calendarId,
            job.eventId,
            projectTask(job.task, job.reminderMinutes, deps.config.appUrl),
            job.etag,
          );
        } catch (error) {
          if (!(error instanceof ProviderError) || error.code !== "not_found")
            throw error;
          try {
            await provider.verifyCalendar(tokens.accessToken, calendarId);
          } catch (calendarError) {
            if (
              calendarError instanceof ProviderError &&
              calendarError.code === "not_found"
            )
              throw new ProviderError("remote_calendar_deleted");
            throw calendarError;
          }
          // Confirmed missing event, not a transient HTTP failure. Database rotates the tombstoned ID before retry.
          throw new ProviderError("remote_event_deleted", true);
        }
        await deps.rpc("gc_finish_job", {
          job_id: job.jobId,
          lease_token: job.leaseToken,
          result: { status: "synced", etag },
        });
        processed++;
      } catch (error) {
        const code =
          error instanceof ProviderError ? error.code : "unavailable";
        const status =
          code === "reconnect"
            ? "reconnect"
            : error instanceof ProviderError && error.retryable
              ? "retry"
              : "failed";
        try {
          await deps.rpc("gc_finish_job", {
            job_id: job.jobId,
            lease_token: job.leaseToken,
            result: { status, errorCode: code },
          });
        } catch {
          /* lease expiration leaves work reclaimable */
        }
        failed++;
      }
    }
    return respond({ processed, failed });
  };
}
