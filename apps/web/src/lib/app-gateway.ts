import type {
  GoogleCalendarConnect,
  GoogleCalendarPreferences,
  GoogleCalendarStatus,
} from "./google-calendar.js";
import type {
  FinanceCommandConfirmation,
  FinanceCommandProposal,
  FinanceCommandReceipt,
  FinanceGatewayCommand,
  Task,
  TaskCommandReceipt,
  TaskGatewayCommand,
} from "@gabio/contracts";

export type FinanceAccount = {
  id: string;
  name: string;
  accountType: string;
  currencyCode: "BRL";
  visibility: "household" | "private";
  version: number;
  isArchived?: boolean;
};
export type FinanceCategory = {
  id: string;
  name: string;
  kind: "income" | "expense" | "both";
  visibility: "household" | "private";
  version: number;
  isArchived?: boolean;
};
export type FinanceTransaction = {
  id: string;
  accountId: string;
  categoryId: string | null;
  direction: "income" | "expense";
  amountMinor: string;
  currencyCode: "BRL";
  description: string;
  occurredOn: string;
  visibility: "household" | "private";
  status: "posted" | "reversed";
  reversalOfId: string | null;
};
export type FinanceBudget = {
  id: string;
  categoryId: string;
  month: string;
  amountMinor: string;
  visibility: "household" | "private";
  version: number;
};
export type FinanceRecurrence = {
  id: string;
  accountId: string;
  categoryId: string | null;
  direction: "income" | "expense";
  amountMinor: string;
  description: string;
  frequency: "weekly" | "monthly" | "yearly";
  nextDueOn: string;
  visibility: "household" | "private";
  version: number;
};
export type FinanceSnapshot = {
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  transactions: FinanceTransaction[];
  budgets: FinanceBudget[];
  recurrences: FinanceRecurrence[];
};
export type CalendarEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  syncStatus: "pending" | "synced" | "failed" | "cancelled";
};
export type TelegramConnection = {
  connected: true;
  linkedAt: string;
};
export type TelegramPairing = {
  code: string;
  expiresAt: string;
};

export type AuthEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "PASSWORD_RECOVERY"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
};

export type HouseholdMember = {
  userId: string;
  displayName: string;
  role: "owner" | "member";
};

export type HouseholdContext = {
  id: string;
  name: string;
  role: "owner" | "member";
  members: HouseholdMember[];
};

export type AuthState = {
  event: AuthEvent;
  user: SessionUser | null;
};

export interface AppGateway {
  readonly isConfigured: boolean;
  getSession(): Promise<SessionUser | null>;
  onAuthStateChange(listener: (state: AuthState) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string, redirectTo: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  loadHousehold(): Promise<HouseholdContext | null>;
  loadPendingInvitation(): Promise<string | null>;
  createHousehold(name: string): Promise<void>;
  acceptInvitation(invitationId: string): Promise<void>;
  inviteMember(householdId: string, email: string): Promise<void>;
  updateProfile(displayName: string, timezone: string): Promise<void>;
  getTelegramConnection(): Promise<TelegramConnection | null>;
  requestTelegramPairing(): Promise<TelegramPairing>;
  revokeTelegramConnection(): Promise<void>;
  getGoogleCalendarStatus(): Promise<GoogleCalendarStatus>;
  connectGoogleCalendar(
    preferences: GoogleCalendarConnect,
  ): Promise<{ authorizationUrl: string }>;
  saveGoogleCalendarPreferences(
    preferences: GoogleCalendarPreferences,
  ): Promise<void>;
  completeGoogleCalendar(ticket: string): Promise<void>;
  repairGoogleCalendar(): Promise<void>;
  syncGoogleCalendar(): Promise<void>;
  disconnectGoogleCalendar(removeEvents: boolean): Promise<void>;
  listTasks(): Promise<Task[]>;
  listCalendarEvents(): Promise<CalendarEvent[]>;
  executeTaskCommand(command: TaskGatewayCommand): Promise<TaskCommandReceipt>;
  loadFinance(): Promise<FinanceSnapshot>;
  prepareFinanceCommand(
    command: FinanceGatewayCommand,
  ): Promise<FinanceCommandProposal>;
  confirmFinanceCommand(
    confirmation: FinanceCommandConfirmation,
  ): Promise<FinanceCommandReceipt>;
}

export class GatewayError extends Error {
  constructor(
    message = "Não foi possível concluir a operação.",
    readonly kind: "generic" | "conflict" = "generic",
  ) {
    super(message);
    this.name = "GatewayError";
  }
}
