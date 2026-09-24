import {
  taskCommandReceiptSchema,
  taskGatewayCommandSchema,
  taskSchema,
  type TaskGatewayCommand,
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
  type HouseholdContext,
  type SessionUser,
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
    status: z.enum(["open", "completed", "cancelled"]),
    completed_at: z.string().nullable(),
    version: z.number().int().positive(),
    created_at: z.string(),
    updated_at: z.string(),
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
