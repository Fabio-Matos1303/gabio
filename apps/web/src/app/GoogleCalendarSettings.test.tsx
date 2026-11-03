import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleCalendarSettings } from "./GoogleCalendarSettings.js";
import {
  googleCalendarConnectSchema,
  googleAuthorizationSchema,
} from "../lib/google-calendar.js";
const authorizationUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?state=synthetic-state";
const connected = {
  status: "connected" as const,
  exportHousehold: true,
  exportPrivate: false,
  reminderMinutes: null,
  lastSyncedAt: null,
  pendingCount: 2,
  failedCount: 0,
};
function gateway() {
  return {
    getGoogleExportStatus: vi.fn().mockResolvedValue({
      newTaskDestination: "google_calendar",
      version: 1,
      tasksAuthorized: false,
      routingEnabled: true,
    }),
    saveGoogleExportPreferences: vi.fn().mockResolvedValue(undefined),
    getGoogleReadingPermission: vi
      .fn()
      .mockResolvedValue({ state: "not_authorized" }),
    getGoogleCalendarStatus: vi
      .fn()
      .mockResolvedValue({ enabled: true, connection: null }),
    connectGoogleCalendar: vi.fn().mockResolvedValue({ authorizationUrl }),
    saveGoogleCalendarPreferences: vi.fn().mockResolvedValue(undefined),
    completeGoogleCalendar: vi.fn().mockResolvedValue(undefined),
    repairGoogleCalendar: vi.fn().mockResolvedValue(undefined),
    syncGoogleCalendar: vi.fn().mockResolvedValue(undefined),
    disconnectGoogleCalendar: vi.fn().mockResolvedValue(undefined),
  };
}
beforeEach(() => {
  window.history.replaceState({}, "", "/#configuracoes");
});

describe("Google Tasks destination", () => {
  it("defaults to Tasks in settings and changes only after explicit save", async () => {
    const api = gateway();
    api.getGoogleCalendarStatus.mockResolvedValue({
      enabled: true,
      connection: connected,
    });
    api.getGoogleExportStatus.mockResolvedValue({
      newTaskDestination: "google_tasks",
      version: 4,
      tasksAuthorized: false,
      routingEnabled: true,
    });
    render(<GoogleCalendarSettings gateway={api} />);
    const select = await screen.findByRole("combobox", {
      name: "Enviar novas tarefas para",
    });
    await waitFor(() => expect(select).toBeEnabled());
    expect(select).toHaveValue("google_tasks");
    expect(
      screen.queryByRole("combobox", { name: "Lembrete de prazo" }),
    ).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: "google_calendar" } });
    expect(api.saveGoogleExportPreferences).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar destino" }));
    await waitFor(() =>
      expect(api.saveGoogleExportPreferences).toHaveBeenCalledWith({
        commandId: expect.any(String),
        expectedVersion: 4,
        destination: "google_calendar",
      }),
    );
    expect(api.saveGoogleCalendarPreferences).not.toHaveBeenCalled();
  });
  it("requires explicit Tasks write consent and sends saved privacy settings", async () => {
    const api = gateway();
    api.getGoogleCalendarStatus.mockResolvedValue({
      enabled: true,
      connection: connected,
    });
    api.getGoogleExportStatus.mockResolvedValue({
      newTaskDestination: "google_tasks",
      version: 1,
      tasksAuthorized: false,
      routingEnabled: true,
    });
    render(<GoogleCalendarSettings gateway={api} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Autorizar Google Tarefas" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByLabelText("Minhas tarefas privadas"));
    fireEvent.click(
      screen.getByRole("button", { name: "Autorizar Google Tarefas" }),
    );
    const connect = screen.getByRole("button", {
      name: "Conectar escrita do Google",
    });
    expect(connect).toBeDisabled();
    fireEvent.click(
      screen.getByLabelText("Autorizo a escrita no Google Tarefas"),
    );
    fireEvent.click(connect);
    await waitFor(() =>
      expect(api.connectGoogleCalendar).toHaveBeenCalledWith({
        exportHousehold: true,
        exportPrivate: false,
        reminderMinutes: null,
        importUpcoming: false,
        writeTasks: true,
      }),
    );
    expect(api.saveGoogleExportPreferences).not.toHaveBeenCalled();
  });
  it("cannot overwrite a saved destination when its status is unavailable", async () => {
    const api = gateway();
    api.getGoogleCalendarStatus.mockResolvedValue({
      enabled: true,
      connection: connected,
    });
    api.getGoogleExportStatus.mockRejectedValue(new Error("network"));
    render(<GoogleCalendarSettings gateway={api} />);
    await screen.findByText(/Não foi possível verificar o destino salvo/);
    expect(
      screen.getByRole("button", { name: "Salvar destino" }),
    ).toBeDisabled();
  });
});
describe("Google Calendar settings", () => {
  it("accepts a strict connect request and rejects unauthorized redirect origins", () => {
    expect(
      googleCalendarConnectSchema.safeParse({
        exportHousehold: true,
        exportPrivate: false,
        reminderMinutes: null,
        importUpcoming: true,
      }).success,
    ).toBe(true);
    for (const url of [
      "https://accounts.google.com.evil.test/o/oauth2/v2/auth",
      "javascript:alert(1)",
      "https://accounts.google.com/other",
    ])
      expect(
        googleAuthorizationSchema.safeParse({ authorizationUrl: url }).success,
      ).toBe(false);
    expect(
      googleCalendarConnectSchema.safeParse({
        exportHousehold: true,
        exportPrivate: false,
        reminderMinutes: null,
        importUpcoming: true,
        ownerUserId: "untrusted",
      }).success,
    ).toBe(false);
  });
  it("does not offer authorization when the backend is disabled", async () => {
    const api = gateway();
    api.getGoogleCalendarStatus.mockResolvedValue({
      enabled: false,
      connection: null,
    });
    render(<GoogleCalendarSettings gateway={api} />);
    expect(
      await screen.findByText(/Integração em preparação/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Conectar Google" }),
    ).not.toBeInTheDocument();
    expect(api.connectGoogleCalendar).not.toHaveBeenCalled();
  });
  it("requires a selection and sends explicit private-task consent", async () => {
    const api = gateway();
    render(<GoogleCalendarSettings gateway={api} />);
    const connect = await screen.findByRole("button", {
      name: "Conectar Google",
    });
    fireEvent.click(screen.getByLabelText("Tarefas da casa"));
    fireEvent.click(connect);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Selecione pelo menos um grupo",
    );
    expect(api.connectGoogleCalendar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Minhas tarefas privadas"));
    fireEvent.click(connect);
    expect(
      await screen.findByRole("link", { name: "Continuar no Google" }),
    ).toHaveAttribute("href", authorizationUrl);
    expect(api.connectGoogleCalendar).toHaveBeenCalledWith({
      exportHousehold: false,
      exportPrivate: true,
      reminderMinutes: null,
      importUpcoming: false,
    });
  });
  it("blocks duplicate requests and drops the stale authorization URL after an option changes", async () => {
    const api = gateway();
    let complete!: (value: { authorizationUrl: string }) => void;
    api.connectGoogleCalendar.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    render(<GoogleCalendarSettings gateway={api} />);
    const button = await screen.findByRole("button", {
      name: "Conectar Google",
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(api.connectGoogleCalendar).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Minhas tarefas privadas")).toBeDisabled();
    complete({ authorizationUrl });
    await screen.findByRole("link", { name: "Continuar no Google" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(screen.getByLabelText("Minhas tarefas privadas"));
    expect(
      screen.queryByRole("link", { name: "Continuar no Google" }),
    ).not.toBeInTheDocument();
  });
  it("rejects a malformed authorization response before displaying a link", async () => {
    const api = gateway();
    api.connectGoogleCalendar.mockResolvedValue({
      authorizationUrl: "https://evil.test/",
    });
    render(<GoogleCalendarSettings gateway={api} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Conectar Google" }),
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Continuar no Google" }),
    ).not.toBeInTheDocument();
  });
  it("recovers from a failed status load without misreporting disconnection", async () => {
    const api = gateway();
    api.getGoogleCalendarStatus.mockRejectedValueOnce(new Error("network"));
    render(<GoogleCalendarSettings gateway={api} />);
    expect(
      await screen.findByText("Consulta indisponível"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Atualizar estado do Google" }),
    );
    expect(
      await screen.findByRole("button", { name: "Conectar Google" }),
    ).toBeEnabled();
  });
  it("updates preferences and schedules synchronization without claiming it completed", async () => {
    const api = gateway();
    api.getGoogleCalendarStatus.mockResolvedValue({
      enabled: true,
      connection: connected,
    });
    render(<GoogleCalendarSettings gateway={api} />);
    const save = await screen.findByRole("button", {
      name: "Salvar preferências",
    });
    expect(save).toBeDisabled();
    fireEvent.submit(save.closest("form")!);
    expect(api.saveGoogleCalendarPreferences).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Minhas tarefas privadas"));
    expect(screen.getByText("Alterações não salvas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sincronizar" })).toBeDisabled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(api.saveGoogleCalendarPreferences).toHaveBeenCalledWith({
        exportHousehold: true,
        exportPrivate: true,
        reminderMinutes: null,
      }),
    );
    expect(await screen.findByText(/Preferências salvas/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sincronizar" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sincronizar" }));
    expect(
      await screen.findByText(/Sincronização solicitada/),
    ).toBeInTheDocument();
    expect(api.syncGoogleCalendar).toHaveBeenCalledTimes(1);
  });
  it("only requests remote event removal after explicit selection", async () => {
    const api = gateway();
    api.getGoogleCalendarStatus.mockResolvedValue({
      enabled: true,
      connection: connected,
    });
    render(<GoogleCalendarSettings gateway={api} />);
    await screen.findByRole("button", {
      name: "Salvar preferências",
    });
    fireEvent.click(screen.getByText("Gerenciar conexão"));
    fireEvent.click(
      screen.getByLabelText("Remover as cópias do Gabio antes de desconectar"),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar desconexão" }),
    );
    await waitFor(() =>
      expect(api.disconnectGoogleCalendar).toHaveBeenCalledWith(true),
    );
    expect(
      await screen.findByText(/Remoção e desconexão solicitadas/),
    ).toBeInTheDocument();
  });
  it("handles denied callbacks and StrictMode replay without requesting tokens", async () => {
    window.history.replaceState(
      {},
      "",
      "/?google_calendar=denied#configuracoes",
    );
    const api = gateway();
    render(
      <StrictMode>
        <GoogleCalendarSettings gateway={api} />
      </StrictMode>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "não foi autorizada",
    );
    expect(window.location.search).toBe("");
    expect(
      await screen.findByRole("button", { name: "Conectar Google" }),
    ).toBeEnabled();
    expect(api.connectGoogleCalendar).not.toHaveBeenCalled();
  });
  it("binds OAuth completion to the current authenticated gateway and does not duplicate it in StrictMode", async () => {
    const ticket = "a".repeat(43);
    window.history.replaceState(
      {},
      "",
      "/?google_calendar=pending&google_calendar_ticket=" +
        ticket +
        "#configuracoes",
    );
    const api = gateway();
    api.getGoogleCalendarStatus.mockResolvedValue({
      enabled: true,
      connection: connected,
    });
    render(
      <StrictMode>
        <GoogleCalendarSettings gateway={api} />
      </StrictMode>,
    );
    expect(
      await screen.findByText(/Conta Google conectada/),
    ).toBeInTheDocument();
    expect(api.completeGoogleCalendar).toHaveBeenCalledTimes(1);
    expect(api.completeGoogleCalendar).toHaveBeenCalledWith(ticket);
    expect(window.location.search).toBe("");
  });
  it("does not claim a connection when authenticated callback completion is denied", async () => {
    window.history.replaceState(
      {},
      "",
      "/?google_calendar=pending&google_calendar_ticket=" +
        "b".repeat(43) +
        "#configuracoes",
    );
    const api = gateway();
    api.completeGoogleCalendar.mockRejectedValue(new Error("wrong actor"));
    render(<GoogleCalendarSettings gateway={api} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "conta Gabio que iniciou",
    );
    expect(api.getGoogleCalendarStatus).not.toHaveBeenCalled();
  });
  it("requires explicit acknowledgement to stop a failed cleanup", async () => {
    const api = gateway();
    api.getGoogleCalendarStatus.mockResolvedValue({
      enabled: true,
      connection: { ...connected, status: "disconnecting", failedCount: 1 },
    });
    render(<GoogleCalendarSettings gateway={api} />);
    await screen.findByText("Gerenciar conexão");
    fireEvent.click(screen.getByText("Gerenciar conexão"));
    const button = await screen.findByRole("button", {
      name: "Interromper limpeza e desconectar",
    });
    expect(button).toBeDisabled();
    fireEvent.click(
      screen.getByLabelText(
        "Entendo que cópias pendentes de remoção poderão permanecer no Google",
      ),
    );
    fireEvent.click(button);
    await waitFor(() =>
      expect(api.disconnectGoogleCalendar).toHaveBeenCalledWith(false),
    );
    expect(await screen.findByText(/Limpeza interrompida/)).toBeInTheDocument();
  });
  it("keeps a dirty preference draft after status refresh or failed save", async () => {
    const api = gateway();
    api.getGoogleCalendarStatus.mockResolvedValue({
      enabled: true,
      connection: connected,
    });
    api.saveGoogleCalendarPreferences.mockRejectedValue(new Error("network"));
    render(<GoogleCalendarSettings gateway={api} />);
    const save = await screen.findByRole("button", {
      name: "Salvar preferências",
    });
    fireEvent.click(screen.getByLabelText("Minhas tarefas privadas"));
    fireEvent.click(
      screen.getByRole("button", { name: "Atualizar estado do Google" }),
    );
    await waitFor(() =>
      expect(api.getGoogleCalendarStatus).toHaveBeenCalledTimes(2),
    );
    await waitFor(() => expect(save).toBeEnabled());
    expect(screen.getByLabelText("Minhas tarefas privadas")).toBeChecked();
    fireEvent.click(save);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Alterações não salvas")).toBeInTheDocument();
    expect(save).toBeEnabled();
  });
  it("hydrates existing preferences after a failed initial load and refreshes a clean form", async () => {
    const api = gateway();
    api.getGoogleCalendarStatus
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue({
        enabled: true,
        connection: {
          ...connected,
          exportHousehold: false,
          exportPrivate: true,
          reminderMinutes: 60,
        },
      });
    render(<GoogleCalendarSettings gateway={api} />);
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: "Atualizar estado do Google" }),
    );
    const save = await screen.findByRole("button", {
      name: "Salvar preferências",
    });
    expect(screen.getByLabelText("Minhas tarefas privadas")).toBeChecked();
    expect(screen.getByLabelText("Tarefas da casa")).not.toBeChecked();
    expect(
      screen.getByLabelText("Lembrete de prazo", { exact: false }),
    ).toHaveValue("60");
    expect(save).toBeDisabled();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Atualizar estado do Google" }),
      ).toBeEnabled(),
    );
    api.getGoogleCalendarStatus.mockResolvedValue({
      enabled: true,
      connection: { ...connected, reminderMinutes: 15 },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Atualizar estado do Google" }),
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText("Lembrete de prazo", { exact: false }),
      ).toHaveValue("15"),
    );
    expect(screen.getByLabelText("Minhas tarefas privadas")).not.toBeChecked();
    expect(save).toBeDisabled();
  });
  it("requires explicit reading consent and keeps scope choices separate", async () => {
    const api = gateway();
    render(<GoogleCalendarSettings gateway={api} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Autorizar leitura" }),
    );
    const connect = screen.getByRole("button", { name: "Conectar leitura" });
    expect(connect).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Autorizar leitura de Tasks e Agenda nesta conexão",
      }),
    );
    fireEvent.click(connect);
    await screen.findByRole("link", { name: "Continuar no Google" });
    expect(api.connectGoogleCalendar).toHaveBeenCalledWith(
      expect.objectContaining({ readSources: true, importUpcoming: false }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Autorizar leitura de Tasks e Agenda nesta conexão",
      }),
    );
    expect(
      screen.queryByRole("link", { name: "Continuar no Google" }),
    ).toBeNull();
  });
  it("removes a previous authorization link before a retry fails", async () => {
    const api = gateway();
    render(<GoogleCalendarSettings gateway={api} />);
    const connect = await screen.findByRole("button", {
      name: "Conectar Google",
    });
    fireEvent.click(connect);
    await screen.findByRole("link", { name: "Continuar no Google" });
    await waitFor(() => expect(connect).toBeEnabled());
    let reject!: (reason: Error) => void;
    api.connectGoogleCalendar.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    fireEvent.click(connect);
    expect(
      screen.queryByRole("link", { name: "Continuar no Google" }),
    ).toBeNull();
    reject(new Error("synthetic failure"));
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("link", { name: "Continuar no Google" }),
    ).toBeNull();
  });
  it("shows reconnection consequences without requiring a tooltip", async () => {
    const api = gateway();
    api.getGoogleCalendarStatus.mockResolvedValue({
      enabled: true,
      connection: { ...connected, status: "reconnect" as const },
    });
    render(<GoogleCalendarSettings gateway={api} />);
    await screen.findByRole("button", { name: "Reconectar Google" });
    expect(screen.getByText(/Reconectar remove as tags locais/)).toBeVisible();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("restores the recorded reading permission after remount without a checked toggle", async () => {
    const api = gateway();
    api.getGoogleCalendarStatus.mockResolvedValue({
      enabled: true,
      connection: connected,
    });
    api.getGoogleReadingPermission.mockResolvedValue({ state: "authorized" });
    const first = render(<GoogleCalendarSettings gateway={api} />);
    await screen.findByText("Leitura autorizada");
    expect(
      screen.queryByRole("checkbox", { name: /Autorizar leitura/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Gerenciar leitura" }));
    const consent = screen.getByRole("checkbox", {
      name: "Autorizar leitura de Tasks e Agenda nesta conexão",
    });
    expect(consent).not.toBeChecked();
    fireEvent.click(consent);
    fireEvent.click(
      screen.getByRole("button", { name: "Fechar autorização de leitura" }),
    );
    expect(api.connectGoogleCalendar).not.toHaveBeenCalled();
    expect(screen.getByText("Leitura autorizada")).toBeVisible();
    first.unmount();
    render(<GoogleCalendarSettings gateway={api} />);
    expect(await screen.findByText("Leitura autorizada")).toBeVisible();
  });
  it("does not report granted reading just because an authorization link was prepared", async () => {
    const api = gateway();
    render(<GoogleCalendarSettings gateway={api} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Autorizar leitura" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Autorizar leitura de Tasks e Agenda nesta conexão",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Conectar leitura" }));
    await screen.findByRole("link", { name: "Continuar no Google" });
    fireEvent.click(
      screen.getByRole("button", { name: "Fechar autorização de leitura" }),
    );
    expect(screen.getByText("Leitura não autorizada")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Continuar no Google" }),
    ).toBeNull();
  });
  it("shows verification failure instead of inferring permission from connection status", async () => {
    const api = gateway();
    api.getGoogleCalendarStatus.mockResolvedValue({
      enabled: true,
      connection: connected,
    });
    api.getGoogleReadingPermission.mockRejectedValue(new Error("synthetic"));
    render(<GoogleCalendarSettings gateway={api} />);
    expect(
      await screen.findByText("Não foi possível verificar a leitura"),
    ).toBeVisible();
    expect(screen.queryByText("Leitura autorizada")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Verificar leitura" }),
    ).toBeEnabled();
  });
  it("does not apply unsaved private export changes while authorizing reading", async () => {
    const api = gateway();
    api.getGoogleCalendarStatus.mockResolvedValue({
      enabled: true,
      connection: connected,
    });
    api.getGoogleReadingPermission.mockResolvedValue({ state: "authorized" });
    render(<GoogleCalendarSettings gateway={api} />);
    await screen.findByText("Leitura autorizada");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Minhas tarefas privadas" }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Tarefas da casa" }));
    fireEvent.change(
      screen.getByRole("combobox", { name: "Lembrete de prazo" }),
      { target: { value: "60" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Gerenciar leitura" }));
    expect(
      screen.getByText(
        "Alterações de envio não salvas não serão aplicadas nesta autorização.",
      ),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Autorizar leitura de Tasks e Agenda nesta conexão",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Conectar leitura" }));
    await screen.findByRole("link", { name: "Continuar no Google" });
    expect(api.connectGoogleCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        exportHousehold: true,
        exportPrivate: false,
        reminderMinutes: null,
        readSources: true,
      }),
    );
  });
});
