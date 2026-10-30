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
    const next = googleCalendarStatusSchema.parse(
      await gateway.getGoogleCalendarStatus(),
    );
    if (live.current) setSnapshot(next);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        if (live.current)
          setNotice({
            kind: "success",
            text: "Preferências salvas. A sincronização será feita em segundo plano.",
          });
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
  return (
    <article
      className="settings-card google-calendar-settings"
      aria-labelledby="google-calendar-heading"
    >
      <div className="settings-card-heading">
        <div>
          <p className="eyebrow">Integrações</p>
          <h2 id="google-calendar-heading">Google Agenda</h2>
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
      </div>
      <p className="muted">
        Veja os prazos das tarefas na sua conta Google. Cada pessoa conecta a
        própria conta. A gestão das tarefas continua no Gabio.
      </p>
      {notice && (
        <p
          className={"notice " + notice.kind}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}
      {snapshot && !snapshot.enabled && (
        <p>
          Integração em preparação. A conexão será liberada após a configuração
          do Google.
        </p>
      )}
      {snapshot?.enabled && (
        <>
          <form
            className="stack-form compact"
            onSubmit={(event) => void submit(event)}
          >
            <fieldset disabled={disabled}>
              <legend>Quais tarefas enviar para sua agenda?</legend>
              <label className="calendar-checkbox">
                <input
                  type="checkbox"
                  checked={household}
                  onChange={(event) => {
                    setHousehold(event.target.checked);
                    setAuthorizationUrl(null);
                  }}
                />
                Tarefas compartilhadas da casa
              </label>
              <label className="calendar-checkbox">
                <input
                  type="checkbox"
                  checked={privateTasks}
                  onChange={(event) => {
                    setPrivateTasks(event.target.checked);
                    setAuthorizationUrl(null);
                  }}
                />
                Minhas tarefas privadas
              </label>
              <label>
                Lembrete de prazo
                <select
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
            <p className="setup-note">
              Os eventos são lembretes de prazo de 15 minutos e não reservam
              horário. Tarefas sem prazo não são enviadas. Alterações no Google
              não mudam tarefas no Gabio.
            </p>
            <p className="setup-note">
              As tarefas privadas vão para um calendário separado na sua conta.
              Compartilhá-lo manualmente no Google pode expor essas informações.
            </p>
            <button className="primary-button" disabled={disabled}>
              {busy
                ? "Aguarde…"
                : active
                  ? "Salvar preferências da agenda"
                  : "Conectar Google Agenda"}
            </button>
          </form>
          {authorizationUrl && (
            <a
              className="primary-button calendar-authorize"
              href={authorizationUrl}
              rel="noreferrer"
            >
              Continuar no Google
            </a>
          )}
          {active && connection.failedCount > 0 && (
            <details className="calendar-disconnect">
              <summary>Recuperar criação de calendário</summary>
              <p>
                Use se a criação do calendário falhou. Uma tentativa anterior
                pode ter criado um calendário vazio no Google, que você poderá
                excluir manualmente.
              </p>
              <label className="calendar-checkbox">
                <input
                  type="checkbox"
                  checked={confirmRepair}
                  disabled={busy}
                  onChange={(event) => setConfirmRepair(event.target.checked)}
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
            </details>
          )}
          {connection?.status === "disconnecting" && (
            <div className="calendar-disconnect">
              <p>
                Se a remoção não puder ser concluída, você pode interromper a
                limpeza e revogar a conexão.
              </p>
              <label className="calendar-checkbox">
                <input
                  type="checkbox"
                  checked={abandonCleanup}
                  disabled={busy}
                  onChange={(event) => setAbandonCleanup(event.target.checked)}
                />
                Entendo que eventos pendentes de remoção poderão permanecer no
                Google
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
            </div>
          )}
          {connection && connection.status !== "disconnected" && (
            <>
              <p aria-live="polite">
                {connection.pendingCount} pendente(s) · {connection.failedCount}{" "}
                falha(s)
              </p>
              <p className="muted">
                Última sincronização:{" "}
                {connection.lastSyncedAt
                  ? new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone: "America/Bahia",
                    }).format(new Date(connection.lastSyncedAt))
                  : "ainda não realizada"}
              </p>
              <button
                type="button"
                className="secondary-button"
                disabled={busy || !active}
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
              <details className="calendar-disconnect">
                <summary>Desconectar minha conta</summary>
                <label className="calendar-checkbox">
                  <input
                    type="checkbox"
                    checked={removeEvents}
                    disabled={busy || connection.status === "disconnecting"}
                    onChange={(event) => setRemoveEvents(event.target.checked)}
                  />
                  Remover os eventos do Gabio antes de desconectar
                </label>
                <p className="muted">
                  Sem esta opção, os eventos já enviados ficam na sua agenda.
                  Nenhuma tarefa é apagada do Gabio.
                </p>
                <button
                  type="button"
                  className="danger-button"
                  disabled={busy || connection.status === "disconnecting"}
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
              </details>
            </>
          )}
        </>
      )}
      <button
        type="button"
        className="secondary-button"
        disabled={busy || loading}
        onClick={() => void run(refresh)}
      >
        Atualizar estado da agenda
      </button>
    </article>
  );
}
