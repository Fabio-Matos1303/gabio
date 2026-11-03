import { TaskCardDialog } from "./TaskCardDialog.js";
import { HelpTooltip } from "./HelpTooltip.js";
import { TaskIcon } from "./TaskIcon.js";
import "../integration-settings.css";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AppGateway } from "../lib/app-gateway.js";
import {
  googleAuthorizationSchema,
  GOOGLE_PROJECTIONS_CHANGED_EVENT,
  googleExportStatusSchema,
  type GoogleExportStatus,
  googleCalendarPreferencesSchema,
  googleCalendarStatusSchema,
  googleReadingPermissionSchema,
  type GoogleReadingPermission,
  type GoogleCalendarStatus,
} from "../lib/google-calendar.js";

type Notice = { kind: "success" | "error"; text: string } | null;
const labels = {
  connected: "Conectado",
  reconnect: "Reconectar",
  disconnecting: "Removendo cópias",
  disconnected: "Desconectado",
};

type CalendarGateway = Pick<
  AppGateway,
  | "getGoogleExportStatus"
  | "saveGoogleExportPreferences"
  | "getGoogleReadingPermission"
  | "getGoogleCalendarStatus"
  | "connectGoogleCalendar"
  | "saveGoogleCalendarPreferences"
  | "completeGoogleCalendar"
  | "repairGoogleCalendar"
  | "repairGoogleTaskLists"
  | "syncGoogleCalendar"
  | "disconnectGoogleCalendar"
>;
type ReadingState =
  GoogleReadingPermission["state"] | "checking" | "unavailable";
async function loadReadingPermission(
  gateway: CalendarGateway,
): Promise<ReadingState> {
  try {
    if (!gateway.getGoogleReadingPermission) return "unavailable";
    return googleReadingPermissionSchema.parse(
      await gateway.getGoogleReadingPermission(),
    ).state;
  } catch {
    return "unavailable";
  }
}
export function GoogleCalendarSettings({
  gateway,
}: {
  gateway: CalendarGateway;
}) {
  const [snapshot, setSnapshot] = useState<GoogleCalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [household, setHousehold] = useState(true);
  const [privateTasks, setPrivateTasks] = useState(false);
  const [reminder, setReminder] = useState("none");
  const [readSources, setReadSources] = useState(false);
  const [readingState, setReadingState] = useState<ReadingState>("checking");
  const [readingDialogOpen, setReadingDialogOpen] = useState(false);
  const importUpcoming = false;
  const [exportStatus, setExportStatus] = useState<GoogleExportStatus | null>(
    null,
  );
  const [destination, setDestination] = useState<
    "google_tasks" | "google_calendar"
  >("google_tasks");
  const [authorizeTasks, setAuthorizeTasks] = useState(false);
  const [tasksDialogOpen, setTasksDialogOpen] = useState(false);
  const [removeEvents, setRemoveEvents] = useState(false);
  const [abandonCleanup, setAbandonCleanup] = useState(false);
  const [confirmRepair, setConfirmRepair] = useState(false);
  const [confirmTaskListsRepair, setConfirmTaskListsRepair] = useState(false);
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null);
  const lock = useRef(false);
  const live = useRef(false);

  const [returned] = useState(() => {
    const url = new URL(window.location.href);
    return {
      result: url.searchParams.get("google_calendar"),
      ticket: url.searchParams.get("google_calendar_ticket"),
    };
  });
  const completion = useRef<Promise<void> | null>(null);
  useEffect(() => {
    live.current = true;
    let cancelled = false;
    if (
      ["connected", "pending", "denied", "error"].includes(
        returned.result ?? "",
      )
    ) {
      const url = new URL(window.location.href);
      url.searchParams.delete("google_calendar");
      url.searchParams.delete("google_calendar_ticket");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }
    async function initialize() {
      try {
        if (returned.result === "pending") {
          if (!returned.ticket || !/^[A-Za-z0-9_-]{43}$/.test(returned.ticket))
            throw new Error("Invalid callback");
          if (!completion.current)
            completion.current = gateway.completeGoogleCalendar(
              returned.ticket,
            );
          await completion.current;
          if (!cancelled)
            setNotice({
              kind: "success",
              text: "Conta Google conectada. Acompanhe a sincronização abaixo.",
            });
        } else if (
          returned.result === "denied" ||
          returned.result === "error"
        ) {
          if (!cancelled)
            setNotice({
              kind: "error",
              text:
                returned.result === "denied"
                  ? "A conexão com o Google não foi autorizada."
                  : "Não foi possível conectar. Inicie a autorização novamente.",
            });
        }
        const [rawStatus, permission, exportSettings] = await Promise.all([
          gateway.getGoogleCalendarStatus(),
          loadReadingPermission(gateway),
          gateway.getGoogleExportStatus
            ? gateway
                .getGoogleExportStatus()
                .then((v) => googleExportStatusSchema.parse(v))
                .catch(() => null)
            : Promise.resolve(null),
        ]);
        const parsed = googleCalendarStatusSchema.parse(rawStatus);
        if (cancelled) return;
        setSnapshot(parsed);
        if (parsed.connection?.lastSyncedAt || returned.result === "pending")
          window.dispatchEvent(new Event(GOOGLE_PROJECTIONS_CHANGED_EVENT));
        setExportStatus(exportSettings);
        if (exportSettings) setDestination(exportSettings.newTaskDestination);
        setReadingState(permission);
        if (parsed.connection) {
          setHousehold(parsed.connection.exportHousehold);
          setPrivateTasks(parsed.connection.exportPrivate);
          setReminder(
            parsed.connection.reminderMinutes === null
              ? "none"
              : String(parsed.connection.reminderMinutes),
          );
        }
      } catch {
        if (!cancelled)
          setNotice({
            kind: "error",
            text:
              returned.result === "pending"
                ? "Não foi possível confirmar a conexão nesta sessão. Entre com a conta Gabio que iniciou a autorização e conecte novamente."
                : "Não foi possível consultar o Google. Atualize o estado para tentar novamente.",
          });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void initialize();
    return () => {
      cancelled = true;
      live.current = false;
    };
  }, [gateway, returned]);

  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice(null);
    setAuthorizationUrl(null);
    try {
      await action();
    } catch {
      if (live.current)
        setNotice({
          kind: "error",
          text: "Não foi possível concluir a ação. Atualize o estado antes de tentar novamente.",
        });
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function refresh() {
    const preserveDraft = hasLocalEdits;
    const preserveDestination =
      exportStatus !== null && destination !== exportStatus.newTaskDestination;
    try {
      const [rawStatus, permission, exportSettings] = await Promise.all([
        gateway.getGoogleCalendarStatus(),
        loadReadingPermission(gateway),
        gateway.getGoogleExportStatus
          ? gateway
              .getGoogleExportStatus()
              .then((v) => googleExportStatusSchema.parse(v))
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      const next = googleCalendarStatusSchema.parse(rawStatus);
      if (live.current) {
        if (
          next.connection?.lastSyncedAt !==
            snapshot?.connection?.lastSyncedAt ||
          next.connection?.status !== snapshot?.connection?.status
        )
          window.dispatchEvent(new Event(GOOGLE_PROJECTIONS_CHANGED_EVENT));
        setSnapshot(next);
        setExportStatus(exportSettings);
        if (!preserveDestination && exportSettings)
          setDestination(exportSettings.newTaskDestination);
        setReadingState(permission);
        if (!preserveDraft && next.connection) {
          setHousehold(next.connection.exportHousehold);
          setPrivateTasks(next.connection.exportPrivate);
          setReminder(
            next.connection.reminderMinutes === null
              ? "none"
              : String(next.connection.reminderMinutes),
          );
        }
      }
    } catch {
      if (live.current) setReadingState("unavailable");
      throw new Error("Could not refresh integration status");
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active && !hasChanges) return;
    const parsed = googleCalendarPreferencesSchema.safeParse({
      exportHousehold: household,
      exportPrivate: privateTasks,
      reminderMinutes: reminder === "none" ? null : Number(reminder),
    });
    if (!parsed.success) {
      setNotice({
        kind: "error",
        text: "Selecione pelo menos um grupo de tarefas para exportar.",
      });
      return;
    }
    await run(async () => {
      if (snapshot?.connection?.status === "connected") {
        await gateway.saveGoogleCalendarPreferences(parsed.data);
        if (live.current) {
          setSnapshot((current) =>
            current?.connection
              ? {
                  ...current,
                  connection: { ...current.connection, ...parsed.data },
                }
              : current,
          );
          setNotice({
            kind: "success",
            text: "Preferências salvas. A sincronização será feita em segundo plano.",
          });
        }
      } else {
        const result = googleAuthorizationSchema.parse(
          await gateway.connectGoogleCalendar({
            ...parsed.data,
            importUpcoming,
          }),
        );
        if (live.current) setAuthorizationUrl(result.authorizationUrl);
      }
    });
  }
  const connection = snapshot?.connection;
  const readingPreferences =
    connection && connection.status !== "disconnected"
      ? {
          exportHousehold: connection.exportHousehold,
          exportPrivate: connection.exportPrivate,
          reminderMinutes: connection.reminderMinutes,
        }
      : { exportHousehold: true, exportPrivate: false, reminderMinutes: null };
  const active = connection?.status === "connected";
  const disabled =
    busy ||
    loading ||
    !snapshot?.enabled ||
    connection?.status === "disconnecting";
  const hasLocalEdits =
    household !== (connection?.exportHousehold ?? true) ||
    privateTasks !== (connection?.exportPrivate ?? false) ||
    reminder !==
      (connection?.reminderMinutes == null
        ? "none"
        : String(connection.reminderMinutes));
  const hasChanges = active && hasLocalEdits;
  const syncTitle =
    !connection || connection.status === "disconnected"
      ? "Conexão individual"
      : connection.status === "reconnect"
        ? "Reconecte sua conta"
        : connection?.status === "disconnecting"
          ? "Remoção em andamento"
          : connection?.failedCount
            ? "Precisa de atenção"
            : connection?.pendingCount
              ? "Sincronização pendente"
              : connection?.lastSyncedAt
                ? "Tudo em dia"
                : "Pronta para sincronizar";
  const syncDescription =
    !connection || connection.status === "disconnected"
      ? "Cada pessoa autoriza sua própria conta Google."
      : connection.status === "reconnect"
        ? "Autorize o Google novamente para retomar os envios."
        : connection?.status === "disconnecting"
          ? "A conexão será encerrada após a limpeza das cópias."
          : connection?.failedCount
            ? "Algumas atualizações não foram enviadas. Você pode tentar novamente."
            : connection?.pendingCount
              ? "As alterações serão enviadas em segundo plano."
              : connection?.lastSyncedAt
                ? "Nenhuma atualização pendente nesta consulta."
                : "O envio acontece quando houver tarefas elegíveis para o destino salvo.";
  return (
    <article
      className="settings-card google-calendar-settings integration-settings"
      aria-labelledby="google-calendar-heading"
    >
      <header className="integration-heading">
        <div className="integration-identity">
          <span className="integration-brand-icon">
            <TaskIcon name="calendar" />
          </span>
          <div>
            <p className="integration-eyebrow">Integrações</p>
            <h2 id="google-calendar-heading">Google</h2>
          </div>
        </div>
        <div className="integration-status-row">
          <span className={"connection-status " + (active ? "connected" : "")}>
            {loading
              ? "Consultando"
              : snapshot === null
                ? "Consulta indisponível"
                : !snapshot.enabled
                  ? "Em preparação"
                  : connection
                    ? labels[connection.status]
                    : "Desconectado"}
          </span>
          <button
            type="button"
            className="integration-icon-button"
            aria-label="Atualizar estado do Google"
            title="Atualizar estado do Google"
            disabled={busy || loading}
            onClick={() => void run(refresh)}
          >
            <TaskIcon name="refresh" />
          </button>
        </div>
      </header>
      {snapshot?.enabled && (
        <section
          className="integration-section"
          aria-label="Destino de novas tarefas"
        >
          <h3>Destino de novas tarefas</h3>
          <label
            className="integration-field"
            htmlFor="google-task-destination"
          >
            Enviar novas tarefas para
            <select
              id="google-task-destination"
              value={destination}
              disabled={disabled || !exportStatus || !active}
              onChange={(e) =>
                setDestination(
                  e.target.value as "google_tasks" | "google_calendar",
                )
              }
            >
              <option value="google_tasks">Google Tarefas</option>
              <option value="google_calendar">Google Agenda</option>
            </select>
          </label>
          <p className="integration-hint">
            Vale para tarefas criadas a partir de agora. As tarefas anteriores
            mantêm o destino original.
          </p>
          <p className="integration-hint">
            O Google Tarefas recebe apenas o dia. Horários e lembretes
            configurados para o Google Agenda não são enviados.
          </p>
          {!exportStatus && (
            <p role="status">
              Não foi possível verificar o destino salvo. Atualize o estado.
            </p>
          )}
          {exportStatus && !exportStatus.routingEnabled && (
            <p role="status">
              Novo destino em preparação. A integração atual permanece ativa até
              a liberação.
            </p>
          )}
          {exportStatus && (
            <p role="status">
              Destino salvo:{" "}
              {exportStatus.newTaskDestination === "google_tasks"
                ? "Google Tarefas"
                : "Google Agenda"}
              .{" "}
              {exportStatus.tasksAuthorized
                ? "Escrita no Google Tarefas autorizada."
                : "Google Tarefas aguarda autorização de escrita."}
            </p>
          )}
          <div className="integration-actions">
            <button
              type="button"
              className="primary-button"
              disabled={
                disabled ||
                !active ||
                !exportStatus ||
                destination === exportStatus.newTaskDestination ||
                !gateway.saveGoogleExportPreferences
              }
              onClick={() =>
                void run(async () => {
                  if (!exportStatus || !gateway.saveGoogleExportPreferences)
                    return;
                  await gateway.saveGoogleExportPreferences({
                    commandId: crypto.randomUUID(),
                    expectedVersion: exportStatus.version,
                    destination,
                  });
                  await refresh();
                  setNotice({
                    kind: "success",
                    text: "Destino salvo para novas tarefas.",
                  });
                })
              }
            >
              Salvar destino
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={
                disabled ||
                !active ||
                !exportStatus ||
                exportStatus.tasksAuthorized
              }
              onClick={() => {
                setAuthorizeTasks(false);
                setTasksDialogOpen(true);
                setAuthorizationUrl(null);
              }}
            >
              Autorizar Google Tarefas
            </button>
          </div>
          <TaskCardDialog
            open={tasksDialogOpen}
            title="Autorizar Google Tarefas"
            busy={busy}
            onClose={() => {
              if (!lock.current) {
                setTasksDialogOpen(false);
                setAuthorizationUrl(null);
              }
            }}
          >
            <div className="task-dialog-fields">
              <p>
                O Google concede acesso para criar, editar, organizar e excluir
                todas as tarefas da sua conta. O Gabio usa esse acesso somente
                nas listas e tarefas vinculadas à integração.
              </p>
              <p>
                Esta autorização remove as tags locais dos itens Google da
                conexão anterior. Configurações não salvas não serão aplicadas.
              </p>
              <label className="integration-check">
                <input
                  type="checkbox"
                  checked={authorizeTasks}
                  disabled={busy}
                  onChange={(e) => {
                    setAuthorizeTasks(e.target.checked);
                    setAuthorizationUrl(null);
                  }}
                />
                Autorizo a escrita no Google Tarefas
              </label>
              <button
                type="button"
                className="primary-button"
                disabled={disabled || !authorizeTasks}
                onClick={() =>
                  void run(async () => {
                    const result = googleAuthorizationSchema.parse(
                      await gateway.connectGoogleCalendar({
                        ...readingPreferences,
                        importUpcoming: false,
                        writeTasks: true,
                      }),
                    );
                    setAuthorizationUrl(result.authorizationUrl);
                  })
                }
              >
                Conectar escrita do Google
              </button>
              {notice?.kind === "error" && <p role="alert">{notice.text}</p>}
              {authorizationUrl && !busy && (
                <a
                  className="primary-button"
                  href={authorizationUrl}
                  rel="noreferrer"
                >
                  Continuar no Google
                </a>
              )}
            </div>
          </TaskCardDialog>
        </section>
      )}
      {notice && !readingDialogOpen && !tasksDialogOpen && (
        <div
          className={"notice integration-notice " + notice.kind}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            className="integration-icon-button"
            aria-label="Fechar mensagem da agenda"
            onClick={() => setNotice(null)}
          >
            ×
          </button>
        </div>
      )}
      {snapshot && !snapshot.enabled && (
        <p className="integration-hint">Integração em preparação.</p>
      )}
      {snapshot?.enabled && (
        <>
          <div className="integration-options">
            <section
              className="integration-section google-reading-consent"
              aria-labelledby="google-reading-title"
            >
              <div className="integration-section-heading">
                <h3 id="google-reading-title">Ver no Gabio</h3>
                <HelpTooltip label="Sobre a leitura Google">
                  Consulte suas tarefas do Google Tasks e eventos das suas
                  agendas. A leitura é pessoal e não altera itens no Google. O
                  status reflete as permissões registradas na última autorização
                  concluída no Google. Gerenciar leitura inicia uma nova
                  autorização; fechar o diálogo não revoga a atual.
                </HelpTooltip>
              </div>
              <p
                className={`integration-reading-status ${readingState === "authorized" ? "authorized" : ""}`}
                role="status"
              >
                {
                  {
                    authorized: "Leitura autorizada",
                    not_authorized: "Leitura não autorizada",
                    reconnect: "Reconectar para ler",
                    disconnecting: "Desconexão em andamento",
                    disabled: "Leitura indisponível",
                    checking: "Verificando leitura…",
                    unavailable: "Não foi possível verificar a leitura",
                  }[readingState]
                }
              </p>
              <button
                type="button"
                className="secondary-button integration-reading-button"
                disabled={
                  disabled ||
                  readingState === "checking" ||
                  readingState === "disabled" ||
                  readingState === "disconnecting"
                }
                onClick={() => {
                  if (readingState === "unavailable") {
                    void run(refresh);
                    return;
                  }
                  setReadSources(false);
                  setAuthorizationUrl(null);
                  setReadingDialogOpen(true);
                }}
              >
                {readingState === "authorized"
                  ? "Gerenciar leitura"
                  : readingState === "unavailable"
                    ? "Verificar leitura"
                    : readingState === "reconnect"
                      ? "Reconectar leitura"
                      : "Autorizar leitura"}
              </button>
              <TaskCardDialog
                open={readingDialogOpen}
                title="Autorização de leitura"
                busy={busy}
                onClose={() => {
                  if (!lock.current) {
                    setReadingDialogOpen(false);
                    setReadSources(false);
                    setAuthorizationUrl(null);
                  }
                }}
              >
                <div className="task-dialog-fields">
                  <p>Esta ação inicia uma nova autorização no Google.</p>
                  <p>
                    Exportação para o Google:{" "}
                    {readingPreferences.exportHousehold &&
                    readingPreferences.exportPrivate
                      ? "tarefas da casa e suas tarefas privadas"
                      : readingPreferences.exportPrivate
                        ? "suas tarefas privadas"
                        : "tarefas da casa"}
                    .
                  </p>
                  {hasLocalEdits && (
                    <p className="integration-hint">
                      Alterações de envio não salvas não serão aplicadas nesta
                      autorização.
                    </p>
                  )}
                  {readingPreferences.exportPrivate && (
                    <p className="integration-warning">
                      Não compartilhe o calendário “Gabio - Privado” no Google:
                      ele contém suas tarefas privadas.
                    </p>
                  )}
                  <label className="integration-check">
                    <input
                      type="checkbox"
                      checked={readSources}
                      disabled={busy}
                      onChange={(e) => {
                        setReadSources(e.target.checked);
                        setAuthorizationUrl(null);
                      }}
                    />
                    Autorizar leitura de Tasks e Agenda nesta conexão
                  </label>
                  {readingDialogOpen &&
                    connection &&
                    connection.status !== "disconnected" && (
                      <p className="integration-warning">
                        Reconectar remove as tags locais dos itens Google da
                        conexão anterior.
                      </p>
                    )}
                  {notice && notice.kind === "error" && (
                    <p role="alert">{notice.text}</p>
                  )}
                  <button
                    type="button"
                    className="secondary-button integration-reading-button"
                    disabled={disabled || !readSources}
                    onClick={() =>
                      void run(async () => {
                        const result = googleAuthorizationSchema.parse(
                          await gateway.connectGoogleCalendar({
                            exportHousehold: readingPreferences.exportHousehold,
                            exportPrivate: readingPreferences.exportPrivate,
                            reminderMinutes: readingPreferences.reminderMinutes,
                            importUpcoming: false,
                            readSources: true,
                          }),
                        );
                        if (live.current)
                          setAuthorizationUrl(result.authorizationUrl);
                      })
                    }
                  >
                    Conectar leitura
                  </button>

                  {authorizationUrl && !busy && (
                    <a
                      className="primary-button"
                      href={authorizationUrl}
                      rel="noreferrer"
                    >
                      Continuar no Google <span aria-hidden="true">↗</span>
                    </a>
                  )}
                </div>
              </TaskCardDialog>
            </section>
            <form
              className="integration-section integration-export"
              onSubmit={(event) => void submit(event)}
              aria-labelledby="google-export-title"
            >
              <div className="integration-section-heading">
                <h3 id="google-export-title">Tarefas para exportar</h3>
                <HelpTooltip label="Sobre o envio de tarefas">
                  Os grupos selecionados serão enviados para sua conta Google,
                  conforme o destino salvo para cada tarefa. Google Tarefas
                  aceita tarefas sem prazo. No Google Agenda, tarefas com prazo
                  aparecem como eventos livres de 15 minutos. Alterações no
                  Google não mudam tarefas no Gabio.
                </HelpTooltip>
              </div>
              <fieldset disabled={disabled}>
                <legend className="sr-only">
                  Tarefas para exportar ao Google
                </legend>
                <label className="integration-check">
                  <input
                    type="checkbox"
                    checked={household}
                    onChange={(e) => {
                      setHousehold(e.target.checked);
                      setAuthorizationUrl(null);
                    }}
                  />
                  Tarefas da casa
                </label>
                <label className="integration-check">
                  <input
                    type="checkbox"
                    checked={privateTasks}
                    onChange={(e) => {
                      setPrivateTasks(e.target.checked);
                      setAuthorizationUrl(null);
                    }}
                  />
                  Minhas tarefas privadas
                </label>
                {destination === "google_calendar" && (
                  <div className="integration-field">
                    <div className="integration-section-heading">
                      <label htmlFor="google-reminder">Lembrete de prazo</label>
                      <HelpTooltip label="Sobre os lembretes">
                        Os avisos de prazo são enviados pelo Google Agenda,
                        conforme as notificações habilitadas na sua conta.
                      </HelpTooltip>
                    </div>
                    <select
                      id="google-reminder"
                      value={reminder}
                      onChange={(e) => {
                        setReminder(e.target.value);
                        setAuthorizationUrl(null);
                      }}
                    >
                      <option value="none">Sem lembrete</option>
                      <option value="0">No horário do prazo</option>
                      <option value="15">15 minutos antes</option>
                      <option value="60">1 hora antes</option>
                      <option value="1440">1 dia antes</option>
                      {!["none", "0", "15", "60", "1440"].includes(
                        reminder,
                      ) && (
                        <option value={reminder}>
                          {reminder} minutos antes
                        </option>
                      )}
                    </select>
                  </div>
                )}
              </fieldset>
              {privateTasks && (
                <p className="integration-warning">
                  Não compartilhe o calendário “Gabio - Privado” no Google: ele
                  contém suas tarefas privadas.
                </p>
              )}
              {connection?.status === "reconnect" && !readSources && (
                <p className="integration-warning">
                  Reconectar remove as tags locais dos itens Google da conexão
                  anterior.
                </p>
              )}
              <div className="integration-actions">
                <button
                  className="primary-button"
                  disabled={disabled || (active && !hasChanges)}
                >
                  {busy
                    ? "Aguarde…"
                    : active
                      ? "Salvar preferências"
                      : connection?.status === "reconnect"
                        ? "Reconectar Google"
                        : "Conectar Google"}
                </button>
                {active && (
                  <span className="integration-hint" role="status">
                    {hasChanges ? "Alterações não salvas" : "Tudo salvo"}
                  </span>
                )}
              </div>
            </form>
          </div>
          {authorizationUrl &&
            !busy &&
            !readingDialogOpen &&
            !tasksDialogOpen && (
              <div className="integration-authorization" role="status">
                <a
                  className="primary-button"
                  href={authorizationUrl}
                  rel="noreferrer"
                >
                  Continuar no Google <span aria-hidden="true">↗</span>
                </a>
              </div>
            )}
          {connection && connection.status !== "disconnected" && (
            <section
              className="integration-sync"
              aria-label="Estado da sincronização"
            >
              <div className="integration-section-heading">
                <h3>{syncTitle}</h3>
                <HelpTooltip label="Sobre o estado da sincronização">
                  {syncDescription}
                </HelpTooltip>
              </div>
              <div className="integration-sync-summary" role="status">
                <span>{connection.pendingCount} na fila</span>
                <span>{connection.failedCount} falhas</span>
                <span>
                  {connection.lastSyncedAt
                    ? `Último envio: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bahia" }).format(new Date(connection.lastSyncedAt))}`
                    : "Sem envios ainda"}
                </span>
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={busy || !active || hasChanges}
                onClick={() =>
                  void run(async () => {
                    await gateway.syncGoogleCalendar();
                    if (live.current)
                      setNotice({
                        kind: "success",
                        text: "Sincronização solicitada. Atualize o estado em alguns instantes.",
                      });
                  })
                }
              >
                <TaskIcon name="refresh" />
                Sincronizar
              </button>
              {hasChanges && (
                <p className="integration-hint">
                  Salve as preferências antes de sincronizar.
                </p>
              )}
            </section>
          )}
        </>
      )}
      {snapshot?.enabled &&
        connection &&
        connection.status !== "disconnected" && (
          <details className="integration-manage">
            <summary>Gerenciar conexão</summary>
            <div className="integration-manage-content">
              {active &&
                connection.failedCount > 0 &&
                gateway.repairGoogleTaskLists && (
                  <section>
                    <h3>Recuperar listas do Google Tarefas</h3>
                    <p>
                      Sincronizar verifica tarefas cujo envio ficou sem
                      confirmação, sem repetir a criação. Se a criação de uma
                      lista ficou sem resposta, esta ação permite uma nova
                      tentativa. Listas vazias anteriores poderão permanecer no
                      Google.
                    </p>
                    <label className="integration-check">
                      <input
                        type="checkbox"
                        checked={confirmTaskListsRepair}
                        disabled={busy}
                        onChange={(e) =>
                          setConfirmTaskListsRepair(e.target.checked)
                        }
                      />
                      Autorizo recriar listas sem confirmação
                    </label>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy || !confirmTaskListsRepair}
                      onClick={() =>
                        void run(async () => {
                          await gateway.repairGoogleTaskLists!();
                          setConfirmTaskListsRepair(false);
                          await refresh();
                        })
                      }
                    >
                      Recuperar listas
                    </button>
                  </section>
                )}
              {active && connection.failedCount > 0 && (
                <section>
                  <h3>Recuperar calendário</h3>
                  <p>
                    Uma nova tentativa pode criar outro calendário. Calendários
                    vazios anteriores poderão ser excluídos manualmente no
                    Google.
                  </p>
                  <label className="integration-check">
                    <input
                      type="checkbox"
                      checked={confirmRepair}
                      disabled={busy}
                      onChange={(e) => setConfirmRepair(e.target.checked)}
                    />
                    Autorizo tentar criar novamente calendários que ficaram sem
                    confirmação
                  </label>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy || !confirmRepair}
                    onClick={() =>
                      void run(async () => {
                        await gateway.repairGoogleCalendar();
                        if (live.current) {
                          setConfirmRepair(false);
                          setNotice({
                            kind: "success",
                            text: "Recuperação solicitada. Calendários já confirmados serão preservados.",
                          });
                        }
                        await refresh();
                      })
                    }
                  >
                    Reparar calendários
                  </button>
                </section>
              )}
              {connection.status === "disconnecting" ? (
                <section>
                  <h3>Interromper limpeza</h3>
                  <p>
                    Interromper mantém as cópias que ainda não foram removidas e
                    encerra a conexão.
                  </p>
                  <label className="integration-check">
                    <input
                      type="checkbox"
                      checked={abandonCleanup}
                      disabled={busy}
                      onChange={(e) => setAbandonCleanup(e.target.checked)}
                    />
                    Entendo que cópias pendentes de remoção poderão permanecer
                    no Google
                  </label>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={busy || !abandonCleanup}
                    onClick={() =>
                      void run(async () => {
                        await gateway.disconnectGoogleCalendar(false);
                        if (live.current) {
                          setNotice({
                            kind: "success",
                            text: "Limpeza interrompida. Revogação solicitada; as cópias restantes serão mantidas.",
                          });
                          setAbandonCleanup(false);
                        }
                        await refresh();
                      })
                    }
                  >
                    Interromper limpeza e desconectar
                  </button>
                </section>
              ) : (
                <section>
                  <h3>Desconectar minha conta</h3>
                  <p>
                    As tarefas no Gabio serão preservadas. As tags locais dos
                    itens Google serão removidas ao desconectar.
                  </p>
                  <label className="integration-check">
                    <input
                      type="checkbox"
                      checked={removeEvents}
                      disabled={busy}
                      onChange={(e) => setRemoveEvents(e.target.checked)}
                    />
                    Remover as cópias do Gabio antes de desconectar
                  </label>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await gateway.disconnectGoogleCalendar(removeEvents);
                        if (live.current) {
                          setAuthorizationUrl(null);
                          setNotice({
                            kind: "success",
                            text: removeEvents
                              ? "Remoção e desconexão solicitadas. Acompanhe o estado."
                              : "Desconexão solicitada. As cópias existentes serão mantidas.",
                          });
                        }
                        await refresh();
                      })
                    }
                  >
                    Confirmar desconexão
                  </button>
                </section>
              )}
            </div>
          </details>
        )}
    </article>
  );
}
