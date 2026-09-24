import type {
  Task,
  TaskCommandReceipt,
  TaskGatewayCommand,
} from "@gabio/contracts";

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
  createHousehold(name: string): Promise<void>;
  acceptInvitation(invitationId: string): Promise<void>;
  inviteMember(householdId: string, email: string): Promise<void>;
  updateProfile(displayName: string, timezone: string): Promise<void>;
  listTasks(): Promise<Task[]>;
  executeTaskCommand(command: TaskGatewayCommand): Promise<TaskCommandReceipt>;
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
