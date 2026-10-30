import { StrictMode } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AppGateway,
  AuthState,
  HouseholdContext,
  SessionUser,
} from "../lib/app-gateway.js";
import { toSessionUser } from "../lib/supabase-gateway.js";
import { App } from "./App.js";
import { formatMinor, monthKeyInHouseholdTimezone } from "./FinancePanel.js";

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

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "40000000-0000-4000-8000-000000000001",
    householdId: household.id,
    ownerUserId: user.id,
    createdBy: user.id,
    assigneeUserId: null,
    title: "Lavar roupa",
    dueAt: null,
    visibility: "household" as const,
    recurrence: "none" as const,
    status: "open" as const,
    completedAt: null,
    version: 1,
    createdAt: "2026-09-23T12:00:00.000Z",
    updatedAt: "2026-09-23T12:00:00.000Z",
    ...overrides,
  };
}

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
    getGoogleCalendarStatus: async () => ({ enabled: false, connection: null }),
    connectGoogleCalendar: async () => {
      throw new Error("Integração indisponível");
    },
    saveGoogleCalendarPreferences: async () => {},
    completeGoogleCalendar: async () => {},
    repairGoogleCalendar: async () => {},
    syncGoogleCalendar: async () => {},
    disconnectGoogleCalendar: async () => {},
    getTelegramConnection: vi.fn().mockResolvedValue(null),
    requestTelegramPairing: vi.fn().mockResolvedValue({
      code: "a".repeat(48),
      expiresAt: "2026-09-27T18:00:00.000Z",
    }),
    revokeTelegramConnection: vi.fn().mockResolvedValue(undefined),
    listTasks: vi.fn().mockResolvedValue([]),
    listCalendarEvents: vi.fn().mockResolvedValue([]),
    loadFinance: vi.fn().mockResolvedValue({
      accounts: [],
      categories: [],
      transactions: [],
      budgets: [],
      recurrences: [],
    }),
    prepareFinanceCommand: vi.fn().mockImplementation(async (command) => ({
      commandId: command.commandId,
      proposalId: "50000000-0000-4000-8000-000000000001",
      commandHash: "a".repeat(64),
      summary: "Operação de teste",
      review: { operation: command.type },
      expiresAt: "2026-09-24T13:00:00.000Z",
    })),
    confirmFinanceCommand: vi.fn().mockImplementation(async (confirmation) => ({
      commandId: confirmation.commandId,
      commandHash: confirmation.confirmationHash,
      replayed: false,
      affectedIds: ["60000000-0000-4000-8000-000000000001"],
    })),
    executeTaskCommand: vi.fn().mockImplementation(async (command) => ({
      commandId: command.commandId,
      replayed: false,
      task: makeTask(),
    })),
  };
}

describe("App", () => {
  it("loads tasks and finishes loading under StrictMode effect replay", async () => {
    window.history.replaceState({}, "", "/#tarefas");
    const gateway = gatewayWith();
    gateway.listTasks = vi
      .fn()
      .mockResolvedValue([makeTask({ title: "Tarefa em StrictMode" })]);
    render(
      <StrictMode>
        <App gateway={gateway} />
      </StrictMode>,
    );
    expect(await screen.findByText("Tarefa em StrictMode")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Atualizar tarefas" }),
      ).toBeEnabled(),
    );
    expect(screen.queryByText("Atualizando tarefas…")).not.toBeInTheDocument();
  });

  it("updates from the server without clearing a draft", async () => {
    window.history.replaceState({}, "", "/#tarefas");
    const gateway = gatewayWith();
    gateway.listTasks = vi
      .fn()
      .mockResolvedValueOnce([makeTask()])
      .mockResolvedValue([
        makeTask({ title: "Atualizada por outro membro", version: 2 }),
      ]);
    render(<App gateway={gateway} />);
    const update = await screen.findByRole("button", {
      name: "Atualizar tarefas",
    });
    await waitFor(() => expect(update).toBeEnabled());
    const title = screen.getByLabelText("Título da tarefa");
    fireEvent.change(title, { target: { value: "Rascunho não enviado" } });
    fireEvent.click(update);
    expect(
      await screen.findByText("Atualizada por outro membro"),
    ).toBeInTheDocument();
    expect(title).toHaveValue("Rascunho não enviado");
  });
  it("blocks repeated submission while a command is in flight", async () => {
    window.history.replaceState({}, "", "/#tarefas");
    const gateway = gatewayWith();
    const response =
      deferred<Awaited<ReturnType<AppGateway["executeTaskCommand"]>>>();
    gateway.executeTaskCommand = vi.fn().mockReturnValue(response.promise);
    render(<App gateway={gateway} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Atualizar tarefas" }),
      ).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText("Título da tarefa"), {
      target: { value: "Envio único" },
    });
    const button = screen.getByRole("button", { name: "Adicionar tarefa" });
    const form = button.closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() =>
      expect(gateway.executeTaskCommand).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByRole("button", { name: "Enviando…" })).toBeDisabled();
    const command = vi.mocked(gateway.executeTaskCommand).mock.calls[0]![0];
    response.resolve({
      commandId: command.commandId,
      replayed: false,
      task: makeTask(),
    });
    expect(await screen.findByText("Tarefa atualizada.")).toBeInTheDocument();
  });
  it("distinguishes a confirmed command from a failed follow-up read", async () => {
    window.history.replaceState({}, "", "/#tarefas");
    const gateway = gatewayWith();
    gateway.listTasks = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValue(new Error("network"));
    render(<App gateway={gateway} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Atualizar tarefas" }),
      ).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText("Título da tarefa"), {
      target: { value: "Confirmada no servidor" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar tarefa" }));
    expect(
      await screen.findByText(
        "Alteração confirmada. Não foi possível atualizar a lista; toque em Atualizar tarefas.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Tarefa atualizada.")).not.toBeInTheDocument();
  });

  it("keeps a failed network creation pending and clears the submitted form", async () => {
    window.history.replaceState({}, "", "/#tarefas");
    const gateway = gatewayWith();
    gateway.executeTaskCommand = vi
      .fn()
      .mockRejectedValue(new Error("network"));
    render(<App gateway={gateway} />);
    const title = await screen.findByLabelText("Título da tarefa");
    fireEvent.change(title, { target: { value: "Tarefa pendente sintética" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar tarefa" }));
    await waitFor(() => expect(title).toHaveValue(""));
    expect(
      await screen.findByText("Tarefa pendente sintética"),
    ).toBeInTheDocument();
    expect(screen.getByText("Aguardando sincronização")).toBeInTheDocument();
    const attempts = vi.mocked(gateway.executeTaskCommand).mock.calls;
    expect(attempts.length).toBeGreaterThan(0);
    expect(new Set(attempts.map(([command]) => command.commandId)).size).toBe(
      1,
    );
  });

  it("opens the task MVP without finance or Telegram navigation", async () => {
    vi.stubEnv("VITE_TASKS_MVP", "true");
    render(<App gateway={gatewayWith()} />);
    expect(
      await screen.findByRole("heading", { name: "Tarefas" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Finanças" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Início" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Ajustes" }));
    expect(
      await screen.findByLabelText("Nome de exibição"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Conectar Telegram" }),
    ).not.toBeInTheDocument();
  });

  it.each(["#inicio", "#financas", "#tarefas"])(
    "keeps production on the task board at %s even with unfinished modules enabled",
    async (hash) => {
      vi.stubEnv("DEV", false);
      vi.stubEnv("VITE_TASKS_MVP", "false");
      vi.stubEnv("VITE_GOOGLE_CALENDAR_ENABLED", "true");
      window.history.replaceState({}, "", `/${hash}`);
      render(<App gateway={gatewayWith()} />);
      expect(
        await screen.findByRole("heading", { name: "Tarefas" }),
      ).toBeInTheDocument();
      for (const name of ["A fazer", "Em andamento", "Concluídas"]) {
        expect(screen.getByRole("heading", { name })).toBeInTheDocument();
      }
      expect(
        screen.queryByRole("link", { name: "Finanças" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Início" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Gabio, tarefas" }),
      ).toHaveAttribute("href", "#tarefas");
      fireEvent.click(screen.getByRole("link", { name: "Ajustes" }));
      expect(
        await screen.findByLabelText("Nome de exibição"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Visão da casa" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Conectar Telegram" }),
      ).not.toBeInTheDocument();
    },
  );

  it("edits a task with its loaded version and completes it directly", async () => {
    window.history.replaceState({}, "", "/#tarefas");
    const gateway = gatewayWith();
    gateway.listTasks = vi.fn().mockResolvedValue([makeTask()]);
    render(<App gateway={gateway} />);
    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    const editor = screen.getByRole("region", { name: "Editar tarefa" });
    fireEvent.change(within(editor).getByLabelText("Título"), {
      target: { value: "Título sintético revisado" },
    });
    fireEvent.click(
      within(editor).getByRole("button", { name: "Salvar tarefa" }),
    );
    await waitFor(() =>
      expect(gateway.executeTaskCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "update",
          payload: expect.objectContaining({
            taskId: makeTask().id,
            expectedVersion: 1,
            title: "Título sintético revisado",
          }),
        }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Editar tarefa" }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    await waitFor(() =>
      expect(gateway.executeTaskCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "set_status",
          payload: expect.objectContaining({
            status: "completed",
            expectedVersion: 1,
          }),
        }),
      ),
    );
  });

  beforeEach(() => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_TASKS_MVP", "false");
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("uses exact cents and the household timezone in financial summaries", () => {
    expect(formatMinor(9_007_199_254_740_993n)).toBe(
      "R$ 90.071.992.547.409,93",
    );
    expect(
      monthKeyInHouseholdTimezone(new Date("2026-10-01T01:30:00.000Z")),
    ).toBe("2026-09");
  });

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
    fireEvent.click(screen.getByRole("button", { name: /Configurações/ }));
    expect(await screen.findByText("1 de 2 membros")).toBeInTheDocument();
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

  it("creates a temporary Telegram pairing from settings", async () => {
    const gateway = gatewayWith();
    render(<App gateway={gateway} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Configurações" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Conectar Telegram" }),
    );
    await waitFor(() =>
      expect(gateway.requestTelegramPairing).toHaveBeenCalled(),
    );
    expect(await screen.findByText("Código temporário")).toBeInTheDocument();
    expect(screen.getByText("a".repeat(48))).toBeInTheDocument();
  });

  it("loads the monthly home calendar and exposes month navigation", async () => {
    const gateway = gatewayWith();
    gateway.listCalendarEvents = vi.fn().mockResolvedValue([
      {
        id: "70000000-0000-4000-8000-000000000001",
        title: "Compromisso de teste",
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 3_600_000).toISOString(),
        timezone: "America/Bahia",
        syncStatus: "pending",
      },
    ]);

    render(<App gateway={gateway} />);

    expect(
      await screen.findByRole("heading", { name: "Visão da casa" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mês anterior" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Próximo mês" })).toBeEnabled();
    await waitFor(() => expect(gateway.listCalendarEvents).toHaveBeenCalled());
    expect(
      (await screen.findAllByText("Compromisso de teste")).length,
    ).toBeGreaterThan(0);
  });

  it("prepares and confirms a financial transaction", async () => {
    const gateway = gatewayWith();
    gateway.loadFinance = vi.fn().mockResolvedValue({
      accounts: [
        {
          id: "50000000-0000-4000-8000-000000000010",
          name: "Conta casa",
          accountType: "checking",
          currencyCode: "BRL",
          visibility: "household",
          version: 1,
        },
      ],
      categories: [
        {
          id: "50000000-0000-4000-8000-000000000011",
          name: "Mercado",
          kind: "expense",
          visibility: "household",
          version: 1,
        },
      ],
      transactions: [],
      budgets: [],
      recurrences: [],
    });
    render(<App gateway={gateway} />);
    fireEvent.click(await screen.findByRole("link", { name: "Finanças" }));
    expect(
      await screen.findByRole("heading", { name: "O que merece sua atenção" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lançamentos" }));
    await screen.findByRole("option", { name: "Conta casa" });
    fireEvent.change(await screen.findByLabelText("Conta"), {
      target: { value: "50000000-0000-4000-8000-000000000010" },
    });
    fireEvent.change(screen.getByLabelText("Categoria"), {
      target: { value: "50000000-0000-4000-8000-000000000011" },
    });
    fireEvent.change(screen.getByLabelText(/Valor/), {
      target: { value: "12.34" },
    });
    fireEvent.change(screen.getByLabelText("Descrição"), {
      target: { value: "Compra sintética" },
    });
    fireEvent.change(screen.getByLabelText("Data"), {
      target: { value: "2026-09-24" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Revisar operação" }));
    await waitFor(() =>
      expect(gateway.prepareFinanceCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "create_transaction",
          payload: expect.objectContaining({ amountMinor: 1234 }),
        }),
      ),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirmar operação" }),
    );
    await waitFor(() =>
      expect(gateway.confirmFinanceCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalId: "50000000-0000-4000-8000-000000000001",
        }),
      ),
    );
  });

  it("manages reusable financial parameters without an agenda tab", async () => {
    const gateway = gatewayWith();
    gateway.loadFinance = vi.fn().mockResolvedValue({
      accounts: [
        {
          id: "50000000-0000-4000-8000-000000000020",
          name: "Conta de teste",
          accountType: "checking",
          currencyCode: "BRL",
          visibility: "household",
          version: 2,
        },
        {
          id: "50000000-0000-4000-8000-000000000022",
          name: "Conta arquivada de teste",
          accountType: "cash",
          currencyCode: "BRL",
          visibility: "household",
          version: 4,
          isArchived: true,
        },
      ],
      categories: [
        {
          id: "50000000-0000-4000-8000-000000000021",
          name: "Categoria de teste",
          kind: "expense",
          visibility: "household",
          version: 3,
        },
        {
          id: "50000000-0000-4000-8000-000000000023",
          name: "Categoria arquivada de teste",
          kind: "expense",
          visibility: "household",
          version: 5,
          isArchived: true,
        },
      ],
      transactions: [],
      budgets: [],
      recurrences: [],
    });

    render(<App gateway={gateway} />);
    expect(
      screen.queryByRole("link", { name: "Agenda" }),
    ).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("link", { name: "Finanças" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cadastros" }));

    expect(screen.getByText("Conta de teste")).toBeInTheDocument();
    expect(screen.getByText("Categoria de teste")).toBeInTheDocument();
    expect(
      screen.queryByText("Conta arquivada de teste"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Categoria arquivada de teste"),
    ).not.toBeInTheDocument();
    const account = screen.getByText("Conta de teste").closest("article");
    expect(account).not.toBeNull();
    fireEvent.click(within(account!).getByRole("button", { name: "Arquivar" }));

    await waitFor(() =>
      expect(gateway.prepareFinanceCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "archive_account",
          payload: {
            accountId: "50000000-0000-4000-8000-000000000020",
            expectedVersion: 2,
          },
        }),
      ),
    );
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

  it("creates a task from the single quick-entry form", async () => {
    const gateway = gatewayWith();
    render(<App gateway={gateway} />);
    fireEvent.click(await screen.findByRole("link", { name: "Tarefas" }));
    fireEvent.change(await screen.findByLabelText("Título da tarefa"), {
      target: { value: "Lavar roupa" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar tarefa" }));
    await waitFor(() =>
      expect(gateway.executeTaskCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "create",
          payload: expect.objectContaining({
            title: "Lavar roupa",
            assigneeUserId: null,
            visibility: "household",
            recurrence: "none",
          }),
        }),
      ),
    );
  });

  it("organizes tasks in visual status columns", async () => {
    const gateway = gatewayWith();
    gateway.listTasks = vi.fn().mockResolvedValue([
      makeTask({ title: "Tarefa aberta" }),
      makeTask({
        id: "40000000-0000-4000-8000-000000000002",
        title: "Tarefa concluída",
        status: "completed",
        completedAt: "2026-09-24T13:00:00.000Z",
      }),
      makeTask({
        id: "40000000-0000-4000-8000-000000000003",
        title: "Tarefa em andamento",
        status: "in_progress",
      }),
    ]);

    render(<App gateway={gateway} />);
    fireEvent.click(await screen.findByRole("link", { name: "Tarefas" }));

    const board = await screen.findByRole("region", {
      name: "Quadro de tarefas",
    });
    expect(await within(board).findByText("Tarefa aberta")).toBeInTheDocument();
    expect(
      await within(board).findByText("Tarefa concluída"),
    ).toBeInTheDocument();
    expect(
      await within(board).findByText("Tarefa em andamento"),
    ).toBeInTheDocument();
    expect(
      within(board).getByRole("heading", { name: "A fazer" }),
    ).toBeInTheDocument();
    expect(
      within(board).getByRole("heading", { name: "Em andamento" }),
    ).toBeInTheDocument();
    expect(
      within(board).getByRole("heading", { name: "Concluídas" }),
    ).toBeInTheDocument();
  });

  it("sends status changes with the visible expected version", async () => {
    const gateway = gatewayWith();
    gateway.listTasks = vi.fn().mockResolvedValue([makeTask()]);
    render(<App gateway={gateway} />);
    fireEvent.click(await screen.findByRole("link", { name: "Tarefas" }));
    fireEvent.click(await screen.findByRole("button", { name: "Iniciar" }));
    await waitFor(() =>
      expect(gateway.executeTaskCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "set_status",
          payload: {
            taskId: "40000000-0000-4000-8000-000000000001",
            expectedVersion: 1,
            status: "in_progress",
          },
        }),
      ),
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
