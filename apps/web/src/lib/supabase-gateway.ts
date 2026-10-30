import {
  googleCalendarConnectSchema,
  googleCalendarPreferencesSchema,
  googleCalendarStatusSchema,
  googleAuthorizationSchema,
  googleCalendarOkSchema,
  type GoogleCalendarConnect,
  type GoogleCalendarPreferences,
} from "./google-calendar.js";
import {
  financeCommandConfirmationSchema,
  financeCommandProposalSchema,
  financeCommandReceiptSchema,
  financeGatewayCommandSchema,
  taskCommandReceiptSchema,
  taskGatewayCommandSchema,
  taskSchema,
  type TaskGatewayCommand,
  type FinanceGatewayCommand,
  type FinanceCommandConfirmation,
} from "@gabio/contracts";
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { z } from "zod";

import {
  GatewayError,
  type AppGateway,
  type AuthEvent,
  type CalendarEvent,
  type FinanceSnapshot,
  type HouseholdContext,
  type SessionUser,
  type TelegramConnection,
  type TelegramPairing,
} from "./app-gateway.js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const sessionUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email().max(254),
    displayName: z.string().trim().min(1).max(120),
  })
  .strict();

const householdContextSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    role: z.enum(["owner", "member"]),
    members: z
      .array(
        z
          .object({
            userId: z.string().uuid(),
            displayName: z.string().trim().min(1).max(120),
            role: z.enum(["owner", "member"]),
          })
          .strict(),
      )
      .min(1)
      .max(2),
  })
  .strict();

const authEventSchema = z.enum([
  "INITIAL_SESSION",
  "SIGNED_IN",
  "SIGNED_OUT",
  "PASSWORD_RECOVERY",
  "TOKEN_REFRESHED",
  "USER_UPDATED",
]);
const invitationDeliverySchema = z
  .object({ delivered: z.literal(true) })
  .strict();
const telegramConnectionSchema = z
  .object({
    connected: z.literal(true),
    linkedAt: z.string().datetime({ offset: true }),
  })
  .strict();
const telegramPairingSchema = z
  .object({
    code: z.string().regex(/^[a-f0-9]{48}$/),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

const taskRowSchema = z
  .object({
    id: z.string().uuid(),
    household_id: z.string().uuid(),
    owner_user_id: z.string().uuid().nullable(),
    created_by: z.string().uuid(),
    assignee_user_id: z.string().uuid().nullable(),
    title: z.string(),
    due_at: z.string().nullable(),
    visibility: z.enum(["household", "private"]),
    recurrence: z.enum(["none", "daily", "weekly", "monthly"]),
    status: z.enum(["open", "in_progress", "completed", "cancelled"]),
    completed_at: z.string().nullable(),
    version: z.number().int().positive(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
const calendarEventRowSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(240),
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(120),
    sync_status: z.enum(["pending", "synced", "failed", "cancelled"]),
  })
  .strict();

const financeAccountRowSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    account_type: z.string(),
    currency_code: z.literal("BRL"),
    visibility: z.enum(["household", "private"]),
    version: z.number().int().positive(),
    is_archived: z.boolean(),
  })
  .strict();
const financeCategoryRowSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    kind: z.enum(["income", "expense", "both"]),
    visibility: z.enum(["household", "private"]),
    version: z.number().int().positive(),
    is_archived: z.boolean(),
  })
  .strict();
const financeTransactionRowSchema = z
  .object({
    id: z.string().uuid(),
    account_id: z.string().uuid(),
    category_id: z.string().uuid().nullable(),
    direction: z.enum(["income", "expense"]),
    amount_minor: z.union([z.string().regex(/^\d+$/), z.number().int().safe()]),
    currency_code: z.literal("BRL"),
    description: z.string(),
    occurred_on: z.string().date(),
    visibility: z.enum(["household", "private"]),
    status: z.enum(["posted", "reversed"]),
    reversal_of_id: z.string().uuid().nullable(),
  })
  .strict();
const financeBudgetRowSchema = z
  .object({
    id: z.string().uuid(),
    category_id: z.string().uuid(),
    month: z.string().date(),
    amount_minor: z.union([z.string().regex(/^\d+$/), z.number().int().safe()]),
    visibility: z.enum(["household", "private"]),
    version: z.number().int().positive(),
  })
  .strict();
const financeRecurrenceRowSchema = z
  .object({
    id: z.string().uuid(),
    account_id: z.string().uuid(),
    category_id: z.string().uuid().nullable(),
    direction: z.enum(["income", "expense"]),
    amount_minor: z.union([z.string().regex(/^\d+$/), z.number().int().safe()]),
    description: z.string(),
    frequency: z.enum(["weekly", "monthly", "yearly"]),
    next_due_on: z.string().date(),
    visibility: z.enum(["household", "private"]),
    version: z.number().int().positive(),
  })
  .strict();

function parseTaskRow(value: unknown) {
  const row = taskRowSchema.parse(value);
  return taskSchema.parse({
    id: row.id,
    householdId: row.household_id,
    ownerUserId: row.owner_user_id,
    createdBy: row.created_by,
    assigneeUserId: row.assignee_user_id,
    title: row.title,
    dueAt: row.due_at,
    visibility: row.visibility,
    recurrence: row.recurrence,
    status: row.status,
    completedAt: row.completed_at,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function toSessionUser(user: User): SessionUser | null {
  const displayName =
    typeof user.user_metadata.display_name === "string"
      ? user.user_metadata.display_name
      : (user.email?.split("@")[0] ?? "Pessoa");

  const parsed = sessionUserSchema.safeParse({
    id: user.id,
    email: user.email ?? "",
    displayName,
  });
  return parsed.success ? parsed.data : null;
}

function friendlyError(): GatewayError {
  return new GatewayError();
}

async function loadVisibleTransactions(client: SupabaseClient) {
  const data: unknown[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const result = await client
      .from("transactions")
      .select(
        "id, account_id, category_id, direction, amount_minor, currency_code, description, occurred_on, visibility, status, reversal_of_id",
      )
      .order("occurred_on", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);
    if (result.error) return { data: null, error: result.error };
    data.push(...result.data);
    if (result.data.length < pageSize) return { data, error: null };
  }
}

export class SupabaseGateway implements AppGateway {
  readonly isConfigured: boolean;
  private readonly client: SupabaseClient | null;

  constructor() {
    this.isConfigured = Boolean(supabaseUrl && supabaseAnonKey);
    this.client = this.isConfigured
      ? createClient(supabaseUrl!, supabaseAnonKey!, {
          auth: {
            flowType: "pkce",
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        })
      : null;
  }

  private configuredClient(): SupabaseClient {
    if (!this.client) throw new GatewayError("Ambiente ainda não configurado.");
    return this.client;
  }

  async getSession(): Promise<SessionUser | null> {
    const { data, error } = await this.configuredClient().auth.getSession();
    if (error) throw friendlyError();
    return data.session?.user ? toSessionUser(data.session.user) : null;
  }

  onAuthStateChange(
    listener: (state: { event: AuthEvent; user: SessionUser | null }) => void,
  ) {
    if (!this.client) return () => undefined;
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      const parsedEvent = authEventSchema.safeParse(event);
      if (!parsedEvent.success) return;
      listener({
        event: parsedEvent.data as AuthEvent,
        user: session?.user ? toSessionUser(session.user) : null,
      });
    });
    return () => data.subscription.unsubscribe();
  }

  async signIn(email: string, password: string) {
    const { error } = await this.configuredClient().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw friendlyError();
  }

  async signOut() {
    const { error } = await this.configuredClient().auth.signOut({
      scope: "local",
    });
    if (error) throw friendlyError();
  }

  async sendPasswordReset(email: string, redirectTo: string) {
    const { error } = await this.configuredClient().auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo },
    );
    if (error) throw friendlyError();
  }

  async updatePassword(password: string) {
    const { error } = await this.configuredClient().auth.updateUser({
      password,
    });
    if (error) throw friendlyError();
  }

  async loadHousehold(): Promise<HouseholdContext | null> {
    const { data, error } = await this.configuredClient().rpc(
      "get_my_household_context",
    );
    if (error) throw friendlyError();
    if (!data) return null;
    return householdContextSchema.parse(data) as HouseholdContext;
  }

  async createHousehold(name: string) {
    const { error } = await this.configuredClient().rpc(
      "create_initial_household",
      {
        household_name: name.trim(),
      },
    );
    if (error) throw friendlyError();
  }

  async loadPendingInvitation(): Promise<string | null> {
    const { data, error } = await this.configuredClient().rpc(
      "get_my_pending_household_invitation",
    );
    if (error) throw friendlyError();
    return z.string().uuid().nullable().parse(data);
  }

  async acceptInvitation(invitationId: string) {
    const { error } = await this.configuredClient().rpc(
      "accept_pending_household_invitation",
      { invitation_id: z.string().uuid().parse(invitationId) },
    );
    if (error)
      throw new GatewayError(
        "O convite é inválido ou não está mais disponível.",
      );
  }

  async inviteMember(householdId: string, email: string) {
    const { data, error } = await this.configuredClient().functions.invoke(
      "invite-household-member",
      { body: { householdId, email: email.trim().toLowerCase() } },
    );
    if (error || !invitationDeliverySchema.safeParse(data).success) {
      throw friendlyError();
    }
  }

  async updateProfile(displayName: string, timezone: string) {
    const client = this.configuredClient();
    const { error } = await client.rpc("update_own_profile", {
      new_display_name: displayName.trim(),
      new_timezone: timezone,
    });
    if (error) throw friendlyError();
  }

  private async calendarAction(body: Record<string, unknown>) {
    const { data, error } = await this.configuredClient().functions.invoke(
      "google-calendar",
      { body, timeout: 15000 },
    );
    if (error)
      throw new GatewayError(
        "Não foi possível acessar o Google Agenda. Tente novamente.",
      );
    return data as unknown;
  }

  async getGoogleCalendarStatus() {
    return googleCalendarStatusSchema.parse(
      await this.calendarAction({ action: "status" }),
    );
  }

  async connectGoogleCalendar(preferences: GoogleCalendarConnect) {
    const validated = googleCalendarConnectSchema.parse(preferences);
    return googleAuthorizationSchema.parse(
      await this.calendarAction({ action: "connect", ...validated }),
    );
  }

  async saveGoogleCalendarPreferences(preferences: GoogleCalendarPreferences) {
    googleCalendarOkSchema.parse(
      await this.calendarAction({
        action: "preferences",
        ...googleCalendarPreferencesSchema.parse(preferences),
      }),
    );
  }

  async completeGoogleCalendar(ticket: string) {
    googleCalendarOkSchema.parse(
      await this.calendarAction({
        action: "complete",
        ticket: z
          .string()
          .regex(/^[A-Za-z0-9_-]{43}$/)
          .parse(ticket),
      }),
    );
  }

  async repairGoogleCalendar() {
    googleCalendarOkSchema.parse(
      await this.calendarAction({
        action: "repair",
        confirmCreateNewCalendars: true,
      }),
    );
  }

  async syncGoogleCalendar() {
    googleCalendarOkSchema.parse(await this.calendarAction({ action: "sync" }));
  }

  async disconnectGoogleCalendar(removeEvents: boolean) {
    googleCalendarOkSchema.parse(
      await this.calendarAction({
        action: "disconnect",
        removeEvents: z.boolean().parse(removeEvents),
      }),
    );
  }

  async getTelegramConnection(): Promise<TelegramConnection | null> {
    const { data, error } = await this.configuredClient().rpc(
      "get_telegram_connection",
    );
    if (error) throw friendlyError();
    if (data === null) return null;
    try {
      return telegramConnectionSchema.parse(data);
    } catch {
      throw friendlyError();
    }
  }

  async requestTelegramPairing(): Promise<TelegramPairing> {
    const { data, error } = await this.configuredClient().rpc(
      "request_telegram_pairing",
    );
    if (error) throw friendlyError();
    try {
      return telegramPairingSchema.parse(data);
    } catch {
      throw friendlyError();
    }
  }

  async revokeTelegramConnection(): Promise<void> {
    const { error } = await this.configuredClient().rpc(
      "revoke_telegram_connection",
    );
    if (error) throw friendlyError();
  }

  async listTasks() {
    const { data, error } = await this.configuredClient()
      .from("tasks")
      .select(
        "id, household_id, owner_user_id, created_by, assignee_user_id, title, due_at, visibility, recurrence, status, completed_at, version, created_at, updated_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw friendlyError();
    try {
      return z.array(taskRowSchema).parse(data).map(parseTaskRow);
    } catch {
      throw friendlyError();
    }
  }

  async listCalendarEvents(): Promise<CalendarEvent[]> {
    const { data, error } = await this.configuredClient()
      .from("calendar_events")
      .select("id, title, starts_at, ends_at, timezone, sync_status")
      .neq("sync_status", "cancelled")
      .order("starts_at");
    if (error) throw friendlyError();
    try {
      return z
        .array(calendarEventRowSchema)
        .parse(data)
        .map((row) => ({
          id: row.id,
          title: row.title,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          timezone: row.timezone,
          syncStatus: row.sync_status,
        }));
    } catch {
      throw friendlyError();
    }
  }

  async loadFinance(): Promise<FinanceSnapshot> {
    const client = this.configuredClient();
    const [
      accountsResult,
      categoriesResult,
      transactionsResult,
      budgetsResult,
      recurrencesResult,
    ] = await Promise.all([
      client
        .from("financial_accounts")
        .select(
          "id, name, account_type, currency_code, visibility, version, is_archived",
        )
        .order("name"),
      client
        .from("finance_categories")
        .select("id, name, kind, visibility, version, is_archived")
        .order("name"),
      loadVisibleTransactions(client),
      client
        .from("finance_budgets")
        .select("id, category_id, month, amount_minor, visibility, version")
        .order("month", { ascending: false }),
      client
        .from("finance_recurrences")
        .select(
          "id, account_id, category_id, direction, amount_minor, description, frequency, next_due_on, visibility, version",
        )
        .eq("is_archived", false)
        .order("next_due_on"),
    ]);
    if (
      [
        accountsResult,
        categoriesResult,
        transactionsResult,
        budgetsResult,
        recurrencesResult,
      ].some((result) => result.error)
    )
      throw friendlyError();
    try {
      const accounts = z
        .array(financeAccountRowSchema)
        .parse(accountsResult.data)
        .map((row) => ({
          id: row.id,
          name: row.name,
          accountType: row.account_type,
          currencyCode: row.currency_code,
          visibility: row.visibility,
          version: row.version,
          isArchived: row.is_archived,
        }));
      const categories = z
        .array(financeCategoryRowSchema)
        .parse(categoriesResult.data)
        .map((row) => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          visibility: row.visibility,
          version: row.version,
          isArchived: row.is_archived,
        }));
      const transactions = z
        .array(financeTransactionRowSchema)
        .parse(transactionsResult.data)
        .map((row) => ({
          id: row.id,
          accountId: row.account_id,
          categoryId: row.category_id,
          direction: row.direction,
          amountMinor: String(row.amount_minor),
          currencyCode: row.currency_code,
          description: row.description,
          occurredOn: row.occurred_on,
          visibility: row.visibility,
          status: row.status,
          reversalOfId: row.reversal_of_id,
        }));
      const budgets = z
        .array(financeBudgetRowSchema)
        .parse(budgetsResult.data)
        .map((row) => ({
          id: row.id,
          categoryId: row.category_id,
          month: row.month,
          amountMinor: String(row.amount_minor),
          visibility: row.visibility,
          version: row.version,
        }));
      const recurrences = z
        .array(financeRecurrenceRowSchema)
        .parse(recurrencesResult.data)
        .map((row) => ({
          id: row.id,
          accountId: row.account_id,
          categoryId: row.category_id,
          direction: row.direction,
          amountMinor: String(row.amount_minor),
          description: row.description,
          frequency: row.frequency,
          nextDueOn: row.next_due_on,
          visibility: row.visibility,
          version: row.version,
        }));
      return { accounts, categories, transactions, budgets, recurrences };
    } catch {
      throw friendlyError();
    }
  }

  async prepareFinanceCommand(command: FinanceGatewayCommand) {
    const parsed = financeGatewayCommandSchema.parse(command);
    const { data, error } = await this.configuredClient().rpc(
      "prepare_finance_command",
      { command: parsed },
    );
    if (error) throw friendlyError();
    try {
      return financeCommandProposalSchema.parse(data);
    } catch {
      throw friendlyError();
    }
  }

  async confirmFinanceCommand(confirmation: FinanceCommandConfirmation) {
    const parsed = financeCommandConfirmationSchema.parse(confirmation);
    const { data, error } = await this.configuredClient().rpc(
      "confirm_finance_command",
      {
        command_id: parsed.commandId,
        proposal_id: parsed.proposalId,
        confirmation_hash: parsed.confirmationHash,
      },
    );
    if (error) {
      if (error.code === "40001")
        throw new GatewayError(
          "Os dados financeiros mudaram em outro dispositivo.",
          "conflict",
        );
      throw friendlyError();
    }
    try {
      return financeCommandReceiptSchema.parse(data);
    } catch {
      throw friendlyError();
    }
  }

  async executeTaskCommand(command: TaskGatewayCommand) {
    const parsed = taskGatewayCommandSchema.parse(command);
    const { data, error } = await this.configuredClient().rpc(
      "execute_task_command",
      {
        command_id: parsed.commandId,
        command: { type: parsed.type, payload: parsed.payload },
      },
    );
    if (error) {
      if (error.code === "40001")
        throw new GatewayError(
          "A tarefa mudou em outro dispositivo.",
          "conflict",
        );
      throw friendlyError();
    }
    try {
      return taskCommandReceiptSchema.parse(data);
    } catch {
      throw friendlyError();
    }
  }
}

export const defaultGateway = new SupabaseGateway();
