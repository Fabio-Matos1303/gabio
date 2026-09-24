import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  AppGateway,
  AuthState,
  HouseholdContext,
  SessionUser,
} from "../lib/app-gateway.js";
import { toSessionUser } from "../lib/supabase-gateway.js";
import { App } from "./App.js";

const user: SessionUser = {
  id: "10000000-0000-4000-8000-000000000001",
  email: "pessoa@example.test",
  displayName: "Pessoa A",
};

const household: HouseholdContext = {
  id: "20000000-0000-4000-8000-000000000001",
  name: "Nossa casa",
  role: "owner",
  members: [{ userId: user.id, displayName: user.displayName, role: "owner" }],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function gatewayWith(
  options: {
    session?: SessionUser | null;
    household?: HouseholdContext | null;
    configured?: boolean;
  } = {},
): AppGateway {
  const currentUser = options.session === undefined ? user : options.session;
  const currentHousehold =
    options.household === undefined ? household : options.household;
  return {
    isConfigured: options.configured ?? true,
    getSession: vi.fn().mockResolvedValue(currentUser),
    onAuthStateChange: vi.fn((_listener: (state: AuthState) => void) =>
      vi.fn(),
    ),
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    sendPasswordReset: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    loadHousehold: vi.fn().mockResolvedValue(currentHousehold),
    createHousehold: vi.fn().mockResolvedValue(undefined),
    acceptInvitation: vi.fn().mockResolvedValue(undefined),
    inviteMember: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue(undefined),
  };
}

describe("App", () => {
  it("fails closed when Supabase is not configured", () => {
    render(<App gateway={gatewayWith({ configured: false })} />);
    expect(
      screen.getByRole("heading", { name: "Conecte o Supabase" }),
    ).toBeInTheDocument();
  });

  it("shows restricted login without public registration", async () => {
    render(<App gateway={gatewayWith({ session: null, household: null })} />);
    expect(
      await screen.findByRole("heading", { name: "Entrar no Gabio" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Contas são criadas somente por convite."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /cadastrar/i }),
    ).not.toBeInTheDocument();
  });

  it("creates the initial household through the gateway", async () => {
    const gateway = gatewayWith({ household: null });
    render(<App gateway={gateway} />);
    fireEvent.change(await screen.findByLabelText("Nome da residência"), {
      target: { value: "Nossa casa" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar residência" }));
    await waitFor(() =>
      expect(gateway.createHousehold).toHaveBeenCalledWith("Nossa casa"),
    );
  });

  it("sets a password and accepts the correlated pending invitation", async () => {
    const invitationId = "30000000-0000-4000-8000-000000000001";
    window.history.replaceState({}, "", `/?join=${invitationId}`);
    const gateway = gatewayWith({ household: null });
    render(<App gateway={gateway} />);

    fireEvent.change(await screen.findByLabelText("Crie sua senha"), {
      target: { value: "uma-senha-segura" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Definir senha e aceitar" }),
    );

    await waitFor(() =>
      expect(gateway.updatePassword).toHaveBeenCalledWith("uma-senha-segura"),
    );
    expect(gateway.acceptInvitation).toHaveBeenCalledWith(invitationId);
    expect(window.location.search).toBe("");
  });

  it("renders the authenticated household and sends an invitation", async () => {
    const gateway = gatewayWith();
    render(<App gateway={gateway} />);
    expect(await screen.findByText("Nossa casa")).toBeInTheDocument();
    expect(screen.getByText("1 de 2 membros")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Convidar por e-mail"), {
      target: { value: "convidada@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar convite" }));
    await waitFor(() =>
      expect(gateway.inviteMember).toHaveBeenCalledWith(
        household.id,
        "convidada@example.test",
      ),
    );
  });

  it("keeps future business actions explicitly disabled", async () => {
    render(<App gateway={gatewayWith()} />);
    expect(
      await screen.findByRole("button", { name: /Nova tarefa/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Novo lançamento/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Novo compromisso/ }),
    ).toBeDisabled();
  });

  it("never combines a new session with the previous household", async () => {
    const previousHousehold = deferred<HouseholdContext | null>();
    const nextHousehold = deferred<HouseholdContext | null>();
    const nextUser: SessionUser = {
      id: "10000000-0000-4000-8000-000000000002",
      email: "pessoa-b@example.test",
      displayName: "Pessoa B",
    };
    const nextContext: HouseholdContext = {
      id: "20000000-0000-4000-8000-000000000002",
      name: "Casa B",
      role: "owner",
      members: [
        {
          userId: nextUser.id,
          displayName: nextUser.displayName,
          role: "owner",
        },
      ],
    };
    let authListener: ((state: AuthState) => void) | undefined;
    const gateway = gatewayWith();
    gateway.loadHousehold = vi
      .fn()
      .mockReturnValueOnce(previousHousehold.promise)
      .mockReturnValueOnce(nextHousehold.promise);
    gateway.onAuthStateChange = vi.fn((listener) => {
      authListener = listener;
      return vi.fn();
    });

    render(<App gateway={gateway} />);
    await waitFor(() => expect(gateway.loadHousehold).toHaveBeenCalledTimes(1));
    authListener?.({ event: "SIGNED_IN", user: nextUser });
    nextHousehold.resolve(nextContext);
    expect(await screen.findByText("Casa B")).toBeInTheDocument();

    previousHousehold.resolve(household);
    await waitFor(() =>
      expect(screen.queryByText("Nossa casa")).not.toBeInTheDocument(),
    );
  });

  it("makes invitation consent explicit during password recovery", async () => {
    const invitationId = "30000000-0000-4000-8000-000000000002";
    window.history.replaceState({}, "", "/?join=" + invitationId);
    let authListener: ((state: AuthState) => void) | undefined;
    const gateway = gatewayWith({ household: null });
    gateway.onAuthStateChange = vi.fn((listener) => {
      authListener = listener;
      return vi.fn();
    });

    render(<App gateway={gateway} />);
    await waitFor(() => expect(gateway.getSession).toHaveBeenCalled());
    authListener?.({ event: "PASSWORD_RECOVERY", user });

    expect(
      await screen.findByRole("heading", {
        name: "Defina a senha e aceite o convite",
      }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nova senha"), {
      target: { value: "uma-senha-segura" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Salvar senha e aceitar convite",
      }),
    );
    await waitFor(() =>
      expect(gateway.acceptInvitation).toHaveBeenCalledWith(invitationId),
    );
  });

  it("rejects malformed editable Auth metadata instead of throwing", () => {
    expect(
      toSessionUser({
        id: user.id,
        email: user.email,
        user_metadata: { display_name: "" },
      } as never),
    ).toBeNull();
  });
});
