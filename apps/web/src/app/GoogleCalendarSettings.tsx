import { HelpTooltip } from "./HelpTooltip.js";
import { TaskIcon } from "./TaskIcon.js";
import "../integration-settings.css";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AppGateway } from "../lib/app-gateway.js";
import {
  googleAuthorizationSchema,
  googleCalendarPreferencesSchema,
  googleCalendarStatusSchema,
  type GoogleCalendarStatus,
} from "../lib/google-calendar.js";

type Notice = { kind: "success" | "error"; text: string } | null;
const labels = {
  connected: "Conectado",
  reconnect: "Reconectar",
  disconnecting: "Removendo eventos",
  disconnected: "Desconectado",
};

type CalendarGateway = Pick<
  AppGateway,
  | "getGoogleCalendarStatus"
  | "connectGoogleCalendar"
  | "saveGoogleCalendarPreferences"
  | "completeGoogleCalendar"
  | "repairGoogleCalendar"
  | "syncGoogleCalendar"
  | "disconnectGoogleCalendar"
>;
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
  const [importUpcoming, setImportUpcoming] = useState(true);
  const [removeEvents, setRemoveEvents] = useState(false);
  const [abandonCleanup, setAbandonCleanup] = useState(false);
  const [confirmRepair, setConfirmRepair] = useState(false);
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
        const parsed = googleCalendarStatusSchema.parse(
          await gateway.getGoogleCalendarStatus(),
        );
        if (cancelled) return;
        setSnapshot(parsed);
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
                : "Não foi possível consultar o Google Agenda. Atualize o estado para tentar novamente.",
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
    const next = googleCalendarStatusSchema.parse(
      await gateway.getGoogleCalendarStatus(),
    );
    if (live.current) {
      setSnapshot(next);
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
            ...(readSources ? { readSources: true } : {}),
          }),
        );
        if (live.current) setAuthorizationUrl(result.authorizationUrl);
      }
    });
  }
  const connection = snapshot?.connection;
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
          ? "A conexão será encerrada após a limpeza dos eventos."
          : connection?.failedCount
            ? "Algumas atualizações não foram enviadas. Você pode tentar novamente."
            : connection?.pendingCount
              ? "As alterações serão enviadas em segundo plano."
              : connection?.lastSyncedAt
                ? "Nenhuma atualização pendente nesta consulta."
                : "O primeiro envio acontece quando houver tarefas com prazo.";
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
            <h2 id="google-calendar-heading">Google Agenda e Tasks</h2>
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
            aria-label="Atualizar estado da agenda"
            title="Atualizar estado da agenda"
            disabled={busy || loading}
            onClick={() => void run(refresh)}
          >
            <TaskIcon name="refresh" />
          </button>
        </div>
      </header>
      {notice && (
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
                  agendas. A leitura é pessoal e não altera itens no Google.
                  Cada pessoa autoriza sua própria conta. Marcar prepara uma
                  nova autorização; desmarcar não revoga uma permissão já
                  concedida.
                </HelpTooltip>
              </div>
              <label className="integration-check">
                <input
                  type="checkbox"
                  checked={readSources}
                  disabled={disabled}
                  onChange={(e) => {
                    setReadSources(e.target.checked);
                    setAuthorizationUrl(null);
                  }}
                />
                Autorizar leitura de Tasks e Agenda
              </label>
              {readSources &&
                connection &&
                connection.status !== "disconnected" && (
                  <p className="integration-warning">
                    Reconectar remove as tags locais dos itens Google da conexão
                    anterior.
                  </p>
                )}
              <button
                type="button"
                className="secondary-button integration-reading-button"
                disabled={disabled || !readSources}
                onClick={() =>
                  void run(async () => {
                    const result = googleAuthorizationSchema.parse(
                      await gateway.connectGoogleCalendar({
                        exportHousehold: household,
                        exportPrivate: privateTasks,
                        reminderMinutes:
                          reminder === "none" ? null : Number(reminder),
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
            </section>
            <form
              className="integration-section integration-export"
              onSubmit={(event) => void submit(event)}
              aria-labelledby="google-export-title"
            >
              <div className="integration-section-heading">
                <h3 id="google-export-title">Enviar ao Google Agenda</h3>
                <HelpTooltip label="Sobre o envio de tarefas">
                  Tarefas com prazo são enviadas para calendários do Gabio na
                  sua conta Google como lembretes de 15 minutos, sem reservar
                  horário. Tarefas sem prazo não são enviadas. Alterações no
                  Google não mudam tarefas no Gabio.
                </HelpTooltip>
              </div>
              <fieldset disabled={disabled}>
                <legend className="sr-only">
                  Tarefas para enviar ao Google Agenda
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
                    {!["none", "0", "15", "60", "1440"].includes(reminder) && (
                      <option value={reminder}>{reminder} minutos antes</option>
                    )}
                  </select>
                </div>
                {!active && (
                  <div className="integration-existing">
                    <label className="integration-check">
                      <input
                        type="checkbox"
                        checked={importUpcoming}
                        onChange={(e) => {
                          setImportUpcoming(e.target.checked);
                          setAuthorizationUrl(null);
                        }}
                      />
                      Incluir pendências a partir de hoje
                    </label>
                    <HelpTooltip label="Sobre as tarefas existentes">
                      Inclui as tarefas abertas que já têm prazo de hoje em
                      diante. As alterações futuras seguem suas preferências de
                      envio.
                    </HelpTooltip>
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
                        ? "Reconectar agenda"
                        : "Conectar agenda"}
                </button>
                {active && (
                  <span className="integration-hint" role="status">
                    {hasChanges ? "Alterações não salvas" : "Tudo salvo"}
                  </span>
                )}
              </div>
            </form>
          </div>
          {authorizationUrl && !busy && (
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
                    Interromper mantém os eventos que ainda não foram removidos
                    e encerra a conexão.
                  </p>
                  <label className="integration-check">
                    <input
                      type="checkbox"
                      checked={abandonCleanup}
                      disabled={busy}
                      onChange={(e) => setAbandonCleanup(e.target.checked)}
                    />
                    Entendo que eventos pendentes de remoção poderão permanecer
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
                            text: "Limpeza interrompida. Revogação solicitada; os eventos restantes serão mantidos.",
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
                    Remover os eventos do Gabio antes de desconectar
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
                              : "Desconexão solicitada. Os eventos existentes serão mantidos.",
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
