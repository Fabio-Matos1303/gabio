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
      className="settings-card google-calendar-settings"
      aria-labelledby="google-calendar-heading"
    >
      <header className="calendar-settings-heading">
        <div className="calendar-settings-identity">
          <span className="calendar-settings-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <rect x="3.5" y="5" width="17" height="16" rx="3" />
              <path d="M7.5 3v4M16.5 3v4M3.5 10h17M8 14h3M8 17h6" />
            </svg>
          </span>
          <div>
            <p className="eyebrow">Integrações</p>
            <h2 id="google-calendar-heading">Google Agenda</h2>
          </div>
        </div>
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
      </header>
      <p className="calendar-settings-description">
        {active
          ? "Escolha quais tarefas aparecem na sua agenda Google."
          : "Conecte sua conta para acompanhar os prazos das tarefas no Google Agenda."}
      </p>
      {notice && (
        <div
          className={"notice calendar-settings-notice " + notice.kind}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            aria-label="Fechar mensagem da agenda"
            onClick={() => setNotice(null)}
          >
            ×
          </button>
        </div>
      )}
      {snapshot && !snapshot.enabled && (
        <p className="calendar-setup-message">
          Integração em preparação. A conexão será liberada após a configuração
          do Google.
        </p>
      )}
      {snapshot?.enabled && (
        <div className="calendar-settings-layout">
          <form
            className="calendar-preferences"
            onSubmit={(event) => void submit(event)}
          >
            <fieldset disabled={disabled}>
              <legend>O que aparece na sua agenda</legend>
              <div className="calendar-task-choices">
                <label className="calendar-task-choice">
                  <input
                    type="checkbox"
                    checked={household}
                    aria-labelledby="calendar-household-label"
                    aria-describedby="calendar-household-help"
                    onChange={(event) => {
                      setHousehold(event.target.checked);
                      setAuthorizationUrl(null);
                    }}
                  />
                  <span>
                    <strong id="calendar-household-label">
                      Tarefas compartilhadas da casa
                    </strong>
                    <small id="calendar-household-help">
                      Acompanhe o que vocês precisam fazer juntos.
                    </small>
                  </span>
                </label>
                <label className="calendar-task-choice">
                  <input
                    type="checkbox"
                    checked={privateTasks}
                    aria-labelledby="calendar-private-label"
                    aria-describedby="calendar-private-help"
                    onChange={(event) => {
                      setPrivateTasks(event.target.checked);
                      setAuthorizationUrl(null);
                    }}
                  />
                  <span>
                    <strong id="calendar-private-label">
                      Minhas tarefas privadas
                    </strong>
                    <small id="calendar-private-help">
                      Só as suas, em um calendário separado.
                    </small>
                  </span>
                </label>
              </div>
              <label className="calendar-reminder">
                <span id="calendar-reminder-label">Lembrete de prazo</span>
                <select
                  aria-labelledby="calendar-reminder-label"
                  aria-describedby="calendar-reminder-help"
                  value={reminder}
                  onChange={(event) => {
                    setReminder(event.target.value);
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
                <small id="calendar-reminder-help">
                  Os avisos são enviados pelo Google Agenda.
                </small>
              </label>
              {!active && (
                <label className="calendar-checkbox">
                  <input
                    type="checkbox"
                    checked={importUpcoming}
                    onChange={(event) => {
                      setImportUpcoming(event.target.checked);
                      setAuthorizationUrl(null);
                    }}
                  />
                  Incluir tarefas abertas com prazo de hoje em diante
                </label>
              )}
            </fieldset>
            {privateTasks && (
              <p className="calendar-private-note">
                Para manter suas tarefas privadas, não compartilhe o calendário
                “Gabio - Privado” no Google.
              </p>
            )}
            <div className="calendar-preferences-actions">
              <button
                className="primary-button"
                disabled={disabled || (active && !hasChanges)}
              >
                {busy
                  ? "Aguarde…"
                  : active
                    ? "Salvar preferências da agenda"
                    : connection?.status === "reconnect"
                      ? "Reconectar Google Agenda"
                      : "Conectar Google Agenda"}
              </button>
              {active && (
                <span
                  className={hasChanges ? "calendar-unsaved" : "calendar-saved"}
                >
                  {hasChanges ? "Alterações não salvas" : "Tudo salvo"}
                </span>
              )}
            </div>
            {authorizationUrl && (
              <a
                className="primary-button calendar-authorize"
                href={authorizationUrl}
                rel="noreferrer"
              >
                Continuar no Google <span aria-hidden="true">↗</span>
              </a>
            )}
          </form>
          <aside
            className="calendar-sync-panel"
            aria-label="Estado da sincronização"
          >
            <p className="eyebrow">Sincronização</p>
            <h3>{syncTitle}</h3>
            <p className="calendar-sync-description">{syncDescription}</p>
            {connection && connection.status !== "disconnected" && (
              <>
                <dl className="calendar-sync-counts" aria-live="polite">
                  <div>
                    <dt>Na fila</dt>
                    <dd>{connection.pendingCount}</dd>
                  </div>
                  <div className={connection.failedCount ? "has-failures" : ""}>
                    <dt>Falhas</dt>
                    <dd>{connection.failedCount}</dd>
                  </div>
                </dl>
                <p className="calendar-sync-last">
                  Última sincronização
                  <strong>
                    {connection.lastSyncedAt
                      ? new Intl.DateTimeFormat("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                          timeZone: "America/Bahia",
                        }).format(new Date(connection.lastSyncedAt))
                      : "Ainda não realizada"}
                  </strong>
                </p>
                <button
                  type="button"
                  className="secondary-button calendar-sync-button"
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
                  Sincronizar tarefas
                </button>
                {hasChanges && (
                  <p className="calendar-sync-hint">
                    Salve suas preferências antes de sincronizar.
                  </p>
                )}
              </>
            )}
            {!connection && (
              <p className="calendar-sync-hint">
                Cada pessoa conecta a própria conta. Nenhuma tarefa é enviada
                antes da autorização.
              </p>
            )}
            <button
              type="button"
              className="calendar-refresh-button"
              disabled={busy || loading}
              onClick={() => void run(refresh)}
            >
              <span aria-hidden="true">↻</span> Atualizar estado da agenda
            </button>
          </aside>
        </div>
      )}
      <div className="calendar-settings-details">
        <details className="calendar-help">
          <summary>Como funciona a integração</summary>
          <div className="calendar-details-content">
            <p>
              A gestão das tarefas continua no Gabio. Tarefas com prazo aparecem
              no Google como lembretes de 15 minutos, sem reservar horário.
            </p>
            <p>
              Tarefas sem prazo não são enviadas. Alterações feitas no Google
              não mudam tarefas no Gabio.
            </p>
            <p>
              As tarefas privadas vão para um calendário separado na sua conta.
              Compartilhá-lo manualmente no Google pode expor essas informações.
            </p>
          </div>
        </details>
        {snapshot?.enabled &&
          connection &&
          connection.status !== "disconnected" && (
            <details className="calendar-manage">
              <summary>Gerenciar conexão</summary>
              <div className="calendar-details-content">
                {active && connection.failedCount > 0 && (
                  <section className="calendar-repair">
                    <h3>Recuperar calendário</h3>
                    <p>
                      Se uma tentativa anterior não foi confirmada, a
                      recuperação pode criar um novo calendário. Um calendário
                      vazio anterior poderá ser excluído manualmente no Google.
                    </p>
                    <label className="calendar-checkbox">
                      <input
                        type="checkbox"
                        checked={confirmRepair}
                        disabled={busy}
                        onChange={(event) =>
                          setConfirmRepair(event.target.checked)
                        }
                      />
                      Autorizo tentar criar novamente calendários que ficaram
                      sem confirmação
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
                      Se a remoção não puder ser concluída, você pode manter os
                      eventos restantes e encerrar a conexão.
                    </p>
                    <label className="calendar-checkbox">
                      <input
                        type="checkbox"
                        checked={abandonCleanup}
                        disabled={busy}
                        onChange={(event) =>
                          setAbandonCleanup(event.target.checked)
                        }
                      />
                      Entendo que eventos pendentes de remoção poderão
                      permanecer no Google
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
                      Você pode manter os eventos já enviados ou removê-los
                      antes de sair. As tarefas no Gabio serão preservadas.
                    </p>
                    <label className="calendar-checkbox">
                      <input
                        type="checkbox"
                        checked={removeEvents}
                        disabled={busy}
                        onChange={(event) =>
                          setRemoveEvents(event.target.checked)
                        }
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
      </div>
      {!snapshot?.enabled && (
        <button
          type="button"
          className="calendar-refresh-button"
          disabled={busy || loading}
          onClick={() => void run(refresh)}
        >
          Atualizar estado da agenda
        </button>
      )}
    </article>
  );
}
