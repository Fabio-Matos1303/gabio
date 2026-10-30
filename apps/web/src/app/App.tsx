import { GoogleCalendarSettings } from "./GoogleCalendarSettings.js";
import {
  taskCreateCommandSchema,
  taskUpdateCommandSchema,
  type Task,
  type TaskGatewayCommand,
} from "@gabio/contracts";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  AppGateway,
  HouseholdContext,
  SessionUser,
} from "../lib/app-gateway.js";
import {
  readTaskSnapshot,
  writeTaskSnapshot,
  projectTaskCommands,
  clearTaskSnapshots,
} from "../lib/task-snapshot.js";
import { defaultGateway } from "../lib/supabase-gateway.js";
import { FinancePanel } from "./FinancePanel.js";
import { HomeCalendar } from "./HomeCalendar.js";
import { HomeInsights } from "./HomeInsights.js";
import { TelegramSettings } from "./TelegramSettings.js";
import {
  createTaskCommandQueue,
  syncTaskCommandQueue,
  type QueuedTaskCommand,
} from "../lib/task-queue.js";

type AppProps = { gateway?: AppGateway };
type Notice = { kind: "success" | "error"; text: string } | null;
const isTaskMvp = () =>
  !import.meta.env.DEV || import.meta.env.VITE_TASKS_MVP !== "false";
type DashboardPage = "home" | "tasks" | "finance" | "settings";

function dashboardPageFromHash(hash: string): DashboardPage {
  const taskMvp = isTaskMvp();
  if (hash === "#tarefas") return "tasks";
  if (hash === "#financas" && !taskMvp) return "finance";
  if (hash === "#configuracoes") return "settings";
  return taskMvp ? "tasks" : "home";
}

function invitationIdFromUrl() {
  const value = new URL(window.location.href).searchParams.get("join");
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : null;
}

function clearJoinFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("join");
  window.history.replaceState(
    {},
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

function NoticeBox({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p
      className={`notice ${notice.kind}`}
      role={notice.kind === "error" ? "alert" : "status"}
    >
      {notice.text}
    </p>
  );
}

function AuthPanel({ gateway }: { gateway: AppGateway }) {
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    try {
      await gateway.signIn(
        String(form.get("email")),
        String(form.get("password")),
      );
    } catch {
      setNotice({ kind: "error", text: "E-mail ou senha inválidos." });
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    try {
      await gateway.sendPasswordReset(
        String(form.get("email")),
        window.location.origin,
      );
      setNotice({
        kind: "success",
        text: "Se a conta existir, você receberá as instruções de recuperação.",
      });
    } catch {
      setNotice({
        kind: "success",
        text: "Se a conta existir, você receberá as instruções de recuperação.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-intro">
        <a className="brand" href="/" aria-label="Gabio, início">
          <span className="brand-mark" aria-hidden="true">
            G
          </span>
          <span>gabio</span>
        </a>
        <p className="eyebrow">Gestão residencial privada</p>
        <h1>A casa em ordem, sem virar trabalho.</h1>
        <p>
          Tarefas, dinheiro e agenda com um espaço compartilhado e privacidade
          individual.
        </p>
      </section>
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">Acesso restrito</p>
        <h2 id="auth-title">
          {mode === "login" ? "Entrar no Gabio" : "Recuperar acesso"}
        </h2>
        <p className="muted">
          {mode === "login"
            ? "Contas são criadas somente por convite."
            : "Informe o e-mail usado no convite."}
        </p>
        <NoticeBox notice={notice} />
        <form
          className="stack-form"
          onSubmit={mode === "login" ? submitLogin : submitReset}
        >
          <label>
            E-mail
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
          {mode === "login" && (
            <label>
              Senha
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
              />
            </label>
          )}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy
              ? "Aguarde…"
              : mode === "login"
                ? "Entrar"
                : "Enviar instruções"}
          </button>
        </form>
        <button
          className="text-button"
          type="button"
          onClick={() => setMode(mode === "login" ? "reset" : "login")}
        >
          {mode === "login" ? "Esqueci minha senha" : "Voltar para o login"}
        </button>
      </section>
    </main>
  );
}

function RecoveryPanel({
  gateway,
  invitationId,
  onComplete,
}: {
  gateway: AppGateway;
  invitationId: string | null;
  onComplete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const password = String(new FormData(event.currentTarget).get("password"));
    try {
      await gateway.updatePassword(password);
      if (invitationId) {
        await gateway.acceptInvitation(invitationId);
        clearJoinFromUrl();
      }
      setNotice({ kind: "success", text: "Senha atualizada com sucesso." });
      await onComplete();
    } catch {
      setNotice({ kind: "error", text: "Não foi possível atualizar a senha." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center-shell">
      <section className="auth-card">
        <p className="eyebrow">Recuperação</p>
        <h1>
          {invitationId
            ? "Defina a senha e aceite o convite"
            : "Defina uma nova senha"}
        </h1>
        {invitationId && (
          <p className="muted">
            Ao continuar, você define a nova senha e entra na residência que
            enviou este convite.
          </p>
        )}
        <NoticeBox notice={notice} />
        <form className="stack-form" onSubmit={submit}>
          <label>
            Nova senha
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          <button className="primary-button" disabled={busy}>
            {busy
              ? "Salvando…"
              : invitationId
                ? "Salvar senha e aceitar convite"
                : "Salvar nova senha"}
          </button>
        </form>
      </section>
    </main>
  );
}

function OnboardingPanel({
  gateway,
  invitationId: linkedInvitationId,
  onReady,
}: {
  gateway: AppGateway;
  invitationId: string | null;
  onReady: () => Promise<void>;
}) {
  const [invitationId, setInvitationId] = useState(linkedInvitationId);
  const [checkingInvitation, setCheckingInvitation] =
    useState(!linkedInvitationId);
  const [invitationLookupFailed, setInvitationLookupFailed] = useState(false);
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    if (linkedInvitationId) return;
    let active = true;
    setCheckingInvitation(true);
    setInvitationLookupFailed(false);
    void gateway
      .loadPendingInvitation()
      .then((pendingId) => {
        if (active) setInvitationId(pendingId);
      })
      .catch(() => {
        if (active) setInvitationLookupFailed(true);
      })
      .finally(() => {
        if (active) setCheckingInvitation(false);
      });
    return () => {
      active = false;
    };
  }, [gateway, linkedInvitationId, lookupAttempt]);

  async function createHousehold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await gateway.createHousehold(
        String(new FormData(event.currentTarget).get("name")),
      );
      await onReady();
    } catch {
      setNotice({
        kind: "error",
        text: "Não foi possível criar a residência.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function acceptInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invitationId) return;
    setBusy(true);
    setNotice(null);
    try {
      const password = String(
        new FormData(event.currentTarget).get("password"),
      );
      await gateway.updatePassword(password);
      await gateway.acceptInvitation(invitationId);
      clearJoinFromUrl();
      await onReady();
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "O convite não está disponível.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center-shell">
      <section className="auth-card">
        <p className="eyebrow">Configuração inicial</p>
        <h1>
          {checkingInvitation || invitationLookupFailed
            ? "Verificar convite"
            : invitationId
              ? "Entrar na residência"
              : "Crie sua residência"}
        </h1>
        <p className="muted">
          {checkingInvitation || invitationLookupFailed
            ? "Vamos conferir se você recebeu um convite antes de criar uma residência."
            : invitationId
              ? "Confirme para entrar com a identidade vinculada a este convite."
              : "Você será o proprietário e poderá convidar a segunda pessoa depois."}
        </p>
        <NoticeBox notice={notice} />
        {checkingInvitation ? (
          <p role="status">Verificando seu convite…</p>
        ) : invitationLookupFailed ? (
          <>
            <p role="alert">
              Não foi possível verificar seu convite. Tente novamente antes de
              continuar ou abra o link original do e-mail.
            </p>
            <button
              className="primary-button"
              onClick={() => setLookupAttempt((attempt) => attempt + 1)}
            >
              Tentar novamente
            </button>
          </>
        ) : invitationId ? (
          <form className="stack-form" onSubmit={acceptInvitation}>
            <label>
              Crie sua senha
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
            <button className="primary-button" disabled={busy}>
              {busy ? "Confirmando…" : "Definir senha e aceitar"}
            </button>
          </form>
        ) : (
          <form className="stack-form" onSubmit={createHousehold}>
            <label>
              Nome da residência
              <input
                name="name"
                required
                minLength={1}
                maxLength={120}
                placeholder="Ex.: Nossa casa"
              />
            </label>
            <button className="primary-button" disabled={busy}>
              {busy ? "Criando…" : "Criar residência"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function TaskPanel({
  gateway,
  user,
  household,
}: {
  gateway: AppGateway;
  user: SessionUser;
  household: HouseholdContext;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [queued, setQueued] = useState<QueuedTaskCommand[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [savingTask, setSavingTask] = useState(false);
  const [sendingTask, setSendingTask] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const commandInFlight = useRef(false);
  const queue = useMemo(createTaskCommandQueue, []);
  const context = useMemo(
    () => ({ userId: user.id, householdId: household.id }),
    [user.id, household.id],
  );
  const contextKey = user.id + ":" + household.id;
  const liveContextKey = useRef<string | null>(contextKey);
  liveContextKey.current = contextKey;

  useEffect(() => {
    liveContextKey.current = contextKey;
    return () => {
      liveContextKey.current = null;
    };
  }, [contextKey]);

  const refreshGeneration = useRef(0);
  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    const isCurrent = () =>
      liveContextKey.current === contextKey &&
      generation === refreshGeneration.current;
    setLoadingTasks(true);
    let confirmed = false;
    try {
      let nextTasks = readTaskSnapshot(context);
      if (navigator.onLine) {
        try {
          nextTasks = await gateway.listTasks();
          if (!isCurrent()) return false;
          writeTaskSnapshot(context, nextTasks);
          setLastUpdated(new Date().toISOString());
          confirmed = true;
        } catch {
          if (!isCurrent()) return false;
          setNotice({
            kind: "error",
            text: "Não foi possível atualizar. A lista exibida pode estar desatualizada. Tente Atualizar tarefas.",
          });
        }
      } else if (isCurrent()) {
        setNotice({
          kind: "error",
          text: "Sem conexão. Conecte-se à internet para atualizar as tarefas.",
        });
      }
      const nextQueued = await queue.list(context);
      if (!isCurrent()) return false;
      setTasks(nextTasks);
      setQueued(nextQueued);
      return confirmed;
    } finally {
      if (isCurrent()) setLoadingTasks(false);
    }
  }, [context, contextKey, gateway, queue]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        if (navigator.onLine)
          await syncTaskCommandQueue(queue, gateway, context, () => active);
        if (active) await refresh();
      } catch {
        if (active)
          setNotice({
            kind: "error",
            text: "Não foi possível carregar as tarefas.",
          });
      }
    };
    const online = () => {
      if (!commandInFlight.current) void load();
    };
    const visible = () => {
      if (
        document.visibilityState === "visible" &&
        navigator.onLine &&
        !commandInFlight.current
      )
        void refresh().catch(() => {
          if (active)
            setNotice({
              kind: "error",
              text: "Não foi possível atualizar as tarefas.",
            });
        });
    };
    const timer = window.setInterval(visible, 30_000);
    document.addEventListener("visibilitychange", visible);
    void load();
    window.addEventListener("online", online);
    return () => {
      active = false;
      window.removeEventListener("online", online);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [context, gateway, queue, refresh]);

  async function updateTasks() {
    if (commandInFlight.current) return;
    commandInFlight.current = true;
    setSendingTask(true);
    setNotice(null);
    try {
      if (navigator.onLine)
        await syncTaskCommandQueue(
          queue,
          gateway,
          context,
          () => liveContextKey.current === contextKey,
        );
      if (liveContextKey.current === contextKey) await refresh();
    } catch {
      if (liveContextKey.current === contextKey)
        setNotice({
          kind: "error",
          text: "Não foi possível atualizar as tarefas.",
        });
    } finally {
      commandInFlight.current = false;
      if (liveContextKey.current === contextKey) setSendingTask(false);
    }
  }

  async function run(command: TaskGatewayCommand) {
    if (commandInFlight.current) return false;
    commandInFlight.current = true;
    setSendingTask(true);
    setNotice(null);
    try {
      // Persist before the first attempt so a lost response can be retried
      // idempotently with the exact same commandId.
      await queue.put(context, command);
      setQueued(await queue.list(context));

      if (!navigator.onLine) {
        setNotice({
          kind: "error",
          text: "Salvo neste dispositivo. Será enviado quando a conexão voltar.",
        });
        return true;
      }

      await syncTaskCommandQueue(
        queue,
        gateway,
        context,
        () => liveContextKey.current === contextKey,
      );
      const remaining = await queue.list(context);
      if (liveContextKey.current !== contextKey) return false;
      setQueued(remaining);
      const current = remaining.find(
        (entry) => entry.command.commandId === command.commandId,
      );
      if (current) {
        if (current.status === "conflict") await refresh();
        if (liveContextKey.current !== contextKey) return false;
        setNotice({
          kind: "error",
          text:
            current.status === "conflict"
              ? "A tarefa mudou em outro dispositivo. Descarte a tentativa, cancele a edição e abra a tarefa novamente."
              : "Salvo neste dispositivo. Aguardando sincronização.",
        });
        return current.status === "pending";
      }

      const refreshed = await refresh();
      if (liveContextKey.current !== contextKey) return false;
      setNotice({
        kind: refreshed ? "success" : "error",
        text: refreshed
          ? "Tarefa atualizada."
          : "Alteração confirmada. Não foi possível atualizar a lista; toque em Atualizar tarefas.",
      });
      return true;
    } catch {
      setNotice({
        kind: "error",
        text: "Não foi possível guardar a alteração neste dispositivo.",
      });
      return false;
    } finally {
      commandInFlight.current = false;
      if (liveContextKey.current === contextKey) setSendingTask(false);
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const dueValue = String(data.get("dueAt") ?? "");
    if (dueValue && Number.isNaN(new Date(dueValue).getTime())) {
      setNotice({ kind: "error", text: "Informe um prazo válido." });
      return;
    }
    const assigneeUserId = String(data.get("assigneeUserId") || "") || null;
    const visibility = String(data.get("visibility"));
    const recurrence = String(data.get("recurrence"));
    if (
      visibility === "private" &&
      assigneeUserId !== null &&
      assigneeUserId !== user.id
    ) {
      setNotice({
        kind: "error",
        text: "Uma tarefa privada só pode ser atribuída a você.",
      });
      return;
    }
    if (recurrence !== "none" && !dueValue) {
      setNotice({
        kind: "error",
        text: "Informe um prazo para criar uma tarefa recorrente.",
      });
      return;
    }
    const parsed = taskCreateCommandSchema.safeParse({
      commandId: crypto.randomUUID(),
      type: "create",
      payload: {
        title: String(data.get("title")),
        dueAt: dueValue ? new Date(dueValue).toISOString() : null,
        assigneeUserId,
        visibility,
        recurrence,
      },
    });
    if (!parsed.success) {
      setNotice({
        kind: "error",
        text: "Revise o título e os detalhes da tarefa.",
      });
      return;
    }
    if (await run(parsed.data)) {
      form.reset();
      setShowDetails(false);
    }
  }

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTask || savingTask) return;
    const form = new FormData(event.currentTarget);
    const due = String(form.get("dueAt") ?? "");
    const parsed = taskUpdateCommandSchema.safeParse({
      commandId: crypto.randomUUID(),
      type: "update",
      payload: {
        taskId: editingTask.id,
        expectedVersion: editingTask.version,
        title: String(form.get("title") ?? ""),
        dueAt:
          due && !Number.isNaN(new Date(due).getTime())
            ? new Date(due).toISOString()
            : null,
        assigneeUserId: String(form.get("assigneeUserId") ?? "") || null,
        recurrence: String(form.get("recurrence")),
        visibility: String(form.get("visibility")),
      },
    });
    if (
      !parsed.success ||
      (parsed.data.payload.recurrence !== "none" &&
        !parsed.data.payload.dueAt) ||
      (parsed.data.payload.visibility === "private" &&
        parsed.data.payload.assigneeUserId &&
        parsed.data.payload.assigneeUserId !== user.id)
    ) {
      setNotice({
        kind: "error",
        text: "Revise os detalhes: recorrências exigem prazo e tarefas privadas só podem ser atribuídas a você.",
      });
      return;
    }
    setSavingTask(true);
    try {
      if (await run(parsed.data)) setEditingTask(null);
    } finally {
      setSavingTask(false);
    }
  }

  const displayedTasks = projectTaskCommands(tasks, queued, context);
  const pendingIds = new Set(
    queued
      .filter((entry) => entry.status === "pending")
      .map((entry) =>
        entry.command.type === "create"
          ? entry.command.commandId
          : entry.command.payload.taskId,
      ),
  );
  async function discardConflict(entry: QueuedTaskCommand) {
    if (entry.status !== "conflict") return;
    await queue.remove(context, entry.command.commandId);
    await refresh();
    setNotice({
      kind: "success",
      text: "Alteração em conflito descartada. Revise a tarefa atual antes de editar novamente.",
    });
  }
  const columns: Array<{
    status: Task["status"];
    title: string;
    description: string;
  }> = [
    {
      status: "open",
      title: "A fazer",
      description: "O que ainda precisa de atenção",
    },
    {
      status: "in_progress",
      title: "Em andamento",
      description: "O que está sendo feito agora",
    },
    {
      status: "completed",
      title: "Concluídas",
      description: "O que a casa já resolveu",
    },
  ];
  const recurrenceLabel = {
    none: null,
    daily: "Diária",
    weekly: "Semanal",
    monthly: "Mensal",
  } as const;
  const memberName = (userId: string | null) =>
    household.members.find((member) => member.userId === userId)?.displayName;

  return (
    <section
      id="tarefas"
      aria-labelledby="tasks-title"
      className="tasks-section"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Rotina</p>
          <h2 id="tasks-title">Tarefas</h2>
          <p className="section-description">
            Capture rapidamente e acompanhe o andamento em um só quadro.
          </p>
          {lastUpdated && (
            <small className="muted">
              Última consulta:{" "}
              {new Intl.DateTimeFormat("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(lastUpdated))}
            </small>
          )}
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={loadingTasks || sendingTask}
          onClick={() => void updateTasks()}
        >
          Atualizar tarefas
        </button>
      </div>
      {loadingTasks && <p role="status">Atualizando tarefas…</p>}
      <NoticeBox notice={notice} />
      {editingTask && (
        <section className="settings-card" aria-label="Editar tarefa">
          <h3>Editar tarefa</h3>
          <form
            className="task-create-details task-editor"
            onSubmit={saveTask}
            key={editingTask.id}
          >
            <label>
              Título
              <input
                disabled={sendingTask}
                name="title"
                defaultValue={editingTask.title}
                required
                maxLength={240}
              />
            </label>
            <label>
              Prazo
              <input
                disabled={sendingTask}
                name="dueAt"
                type="datetime-local"
                defaultValue={
                  editingTask.dueAt
                    ? new Date(
                        new Date(editingTask.dueAt).getTime() -
                          new Date(editingTask.dueAt).getTimezoneOffset() *
                            60000,
                      )
                        .toISOString()
                        .slice(0, 16)
                    : ""
                }
              />
            </label>
            <label>
              Responsável
              <select
                disabled={sendingTask}
                name="assigneeUserId"
                defaultValue={editingTask.assigneeUserId ?? ""}
              >
                <option value="">Sem responsável</option>
                {household.members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Repetir
              <select
                disabled={sendingTask}
                name="recurrence"
                defaultValue={editingTask.recurrence}
              >
                <option value="none">Não repetir</option>
                <option value="daily">Diariamente</option>
                <option value="weekly">Semanalmente</option>
                <option value="monthly">Mensalmente</option>
              </select>
            </label>
            <label>
              Quem pode ver
              <select
                disabled={sendingTask}
                name="visibility"
                defaultValue={editingTask.visibility}
              >
                <option value="household">Todos da casa</option>
                <option
                  value="private"
                  disabled={editingTask.ownerUserId !== user.id}
                >
                  Somente eu
                </option>
              </select>
            </label>
            <button
              className="primary-button"
              disabled={savingTask || sendingTask}
            >
              Salvar tarefa
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={savingTask}
              onClick={() => setEditingTask(null)}
            >
              Cancelar edição
            </button>
          </form>
        </section>
      )}
      {queued.length > 0 && (
        <div className="queue-notice" role="status">
          <strong>{queued.length} alteração(ões) pendente(s)</strong>
          <span>Serão sincronizadas somente nesta conta e residência.</span>
        </div>
      )}
      {queued
        .filter((entry) => entry.status === "conflict")
        .map((entry) => (
          <article className="queue-notice" key={entry.command.commandId}>
            <span>
              A tarefa mudou em outro dispositivo. Descarte esta tentativa e
              revise os dados atuais.
            </span>
            <button type="button" onClick={() => void discardConflict(entry)}>
              Descartar alteração em conflito
            </button>
          </article>
        ))}
      <form className="task-create" onSubmit={createTask}>
        <div className="task-create-main">
          <label>
            <span className="sr-only">Título da tarefa</span>
            <input
              disabled={sendingTask}
              name="title"
              required
              maxLength={240}
              placeholder="O que precisa ser feito?"
            />
          </label>
          <button
            className="task-details-toggle"
            type="button"
            disabled={sendingTask}
            aria-expanded={showDetails}
            onClick={() => setShowDetails((value) => !value)}
          >
            {showDetails ? "Ocultar detalhes" : "Adicionar detalhes"}
          </button>
          <button
            className="primary-button"
            type="submit"
            disabled={sendingTask}
          >
            {sendingTask ? "Enviando…" : "Adicionar tarefa"}
          </button>
        </div>
        <div className="task-create-details" hidden={!showDetails}>
          <label>
            Responsável
            <select
              disabled={sendingTask}
              name="assigneeUserId"
              defaultValue=""
            >
              <option value="">Sem responsável</option>
              {household.members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prazo
            <input disabled={sendingTask} name="dueAt" type="datetime-local" />
          </label>
          <label>
            Repetir
            <select
              disabled={sendingTask}
              name="recurrence"
              defaultValue="none"
            >
              <option value="none">Não repetir</option>
              <option value="daily">Diariamente</option>
              <option value="weekly">Semanalmente</option>
              <option value="monthly">Mensalmente</option>
            </select>
          </label>
          <label>
            Quem pode ver
            <select
              disabled={sendingTask}
              name="visibility"
              defaultValue="household"
            >
              <option value="household">Todos da casa</option>
              <option value="private">Somente eu</option>
            </select>
          </label>
        </div>
      </form>
      <div className="task-board" role="region" aria-label="Quadro de tarefas">
        {columns.map((column) => {
          const columnTasks = displayedTasks.filter(
            (task) => task.status === column.status,
          );
          return (
            <section
              className={`task-column ${column.status}`}
              aria-labelledby={`task-column-${column.status}`}
              key={column.status}
            >
              <header className="task-column-header">
                <div>
                  <h3 id={`task-column-${column.status}`}>{column.title}</h3>
                  <p>{column.description}</p>
                </div>
                <span aria-label={`${columnTasks.length} tarefa(s)`}>
                  {columnTasks.length}
                </span>
              </header>
              <div className="task-column-cards">
                {columnTasks.length === 0 ? (
                  <p className="task-column-empty">Nenhuma tarefa aqui.</p>
                ) : (
                  columnTasks.map((task) => {
                    const assignee = memberName(task.assigneeUserId);
                    const dueDate = task.dueAt ? new Date(task.dueAt) : null;
                    const overdue =
                      (task.status === "open" ||
                        task.status === "in_progress") &&
                      dueDate !== null &&
                      dueDate.getTime() < Date.now();
                    return (
                      <article className="task-card" key={task.id}>
                        <div className="task-card-heading">
                          <strong>{task.title}</strong>
                          <span
                            className={`visibility-chip ${task.visibility}`}
                          >
                            {task.visibility === "private"
                              ? "Somente eu"
                              : "Da casa"}
                          </span>
                        </div>
                        <div className="task-card-meta">
                          {assignee && <span>{assignee}</span>}
                          {dueDate && (
                            <time
                              className={overdue ? "overdue" : undefined}
                              dateTime={task.dueAt ?? undefined}
                            >
                              {overdue ? "Atrasada · " : ""}
                              {new Intl.DateTimeFormat("pt-BR", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(dueDate)}
                            </time>
                          )}
                          {recurrenceLabel[task.recurrence] && (
                            <span>{recurrenceLabel[task.recurrence]}</span>
                          )}
                        </div>
                        {pendingIds.has(task.id) && (
                          <p role="status">Aguardando sincronização</p>
                        )}
                        <fieldset
                          className="task-actions"
                          disabled={sendingTask || pendingIds.has(task.id)}
                        >
                          {(task.status === "open" ||
                            task.status === "in_progress") && (
                            <button
                              type="button"
                              onClick={() => setEditingTask(task)}
                            >
                              Editar
                            </button>
                          )}
                          {task.status === "open" ? (
                            <>
                              <button
                                className="start-task"
                                type="button"
                                onClick={() =>
                                  void run({
                                    commandId: crypto.randomUUID(),
                                    type: "set_status",
                                    payload: {
                                      taskId: task.id,
                                      expectedVersion: task.version,
                                      status: "in_progress",
                                    },
                                  })
                                }
                              >
                                Iniciar
                              </button>
                              <button
                                type="button"
                                className="complete-task"
                                onClick={() =>
                                  void run({
                                    commandId: crypto.randomUUID(),
                                    type: "set_status",
                                    payload: {
                                      taskId: task.id,
                                      expectedVersion: task.version,
                                      status: "completed",
                                    },
                                  })
                                }
                              >
                                Concluir
                              </button>
                            </>
                          ) : task.status === "in_progress" ? (
                            <>
                              <button
                                className="complete-task"
                                type="button"
                                onClick={() =>
                                  void run({
                                    commandId: crypto.randomUUID(),
                                    type: "set_status",
                                    payload: {
                                      taskId: task.id,
                                      expectedVersion: task.version,
                                      status: "completed",
                                    },
                                  })
                                }
                              >
                                Concluir
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void run({
                                    commandId: crypto.randomUUID(),
                                    type: "set_status",
                                    payload: {
                                      taskId: task.id,
                                      expectedVersion: task.version,
                                      status: "open",
                                    },
                                  })
                                }
                              >
                                Voltar
                              </button>
                            </>
                          ) : task.recurrence === "none" ? (
                            <button
                              type="button"
                              onClick={() =>
                                void run({
                                  commandId: crypto.randomUUID(),
                                  type: "set_status",
                                  payload: {
                                    taskId: task.id,
                                    expectedVersion: task.version,
                                    status: "open",
                                  },
                                })
                              }
                            >
                              Reabrir
                            </button>
                          ) : (
                            <span className="task-card-note">
                              Próxima ocorrência criada
                            </span>
                          )}
                        </fieldset>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function Dashboard({
  gateway,
  user,
  household,
  onReload,
}: {
  gateway: AppGateway;
  user: SessionUser;
  household: HouseholdContext;
  onReload: () => Promise<void>;
}) {
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<DashboardPage>(() =>
    dashboardPageFromHash(window.location.hash),
  );
  const taskMvp = isTaskMvp();
  const currentDisplayName =
    household.members.find((member) => member.userId === user.id)
      ?.displayName ?? user.displayName;
  const today = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "America/Bahia",
      }).format(new Date()),
    [],
  );
  useEffect(() => {
    const updatePage = () => {
      setPage(dashboardPageFromHash(window.location.hash));
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", updatePage);
    return () => window.removeEventListener("hashchange", updatePage);
  }, []);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setNotice(null);
    try {
      await gateway.inviteMember(
        household.id,
        String(new FormData(formElement).get("email")),
      );
      formElement.reset();
      setNotice({
        kind: "success",
        text: "Convite enviado. Ele é válido por 24 horas.",
      });
    } catch {
      setNotice({ kind: "error", text: "Não foi possível enviar o convite." });
    } finally {
      setBusy(false);
    }
  }

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await gateway.updateProfile(
        String(new FormData(event.currentTarget).get("displayName")),
        "America/Bahia",
      );
      await onReload();
      setNotice({ kind: "success", text: "Perfil atualizado." });
    } catch {
      setNotice({
        kind: "error",
        text: "Não foi possível atualizar o perfil.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href={taskMvp ? "#tarefas" : "#inicio"}
          aria-label={taskMvp ? "Gabio, tarefas" : "Gabio, início"}
        >
          <span className="brand-mark" aria-hidden="true">
            G
          </span>
          <span>gabio</span>
        </a>
        <div className="account-actions">
          <span>{household.name}</span>
          <button
            className="profile-button"
            type="button"
            aria-label="Configurações"
            title={`Configurações · ${user.email}`}
            onClick={() => {
              window.location.hash = "configuracoes";
            }}
          >
            {currentDisplayName.slice(0, 2).toUpperCase()}
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              clearTaskSnapshots();
              void gateway.signOut();
            }}
          >
            Sair
          </button>
        </div>
      </header>
      {page === "home" && (
        <>
          <section className="home-intro" id="inicio">
            <div>
              <p className="eyebrow">{today}</p>
              <h1>Visão da casa</h1>
            </div>
            <p>Veja o que precisa acontecer e como o mês está organizado.</p>
          </section>
          <HomeInsights gateway={gateway} />
          <HomeCalendar gateway={gateway} />
        </>
      )}
      {page === "tasks" && (
        <div className="module-page">
          <TaskPanel gateway={gateway} user={user} household={household} />
        </div>
      )}
      {page === "finance" && (
        <div className="module-page">
          <FinancePanel gateway={gateway} />
        </div>
      )}
      {page === "settings" && (
        <div className="module-page">
          <NoticeBox notice={notice} />
          <section
            className="settings-grid"
            aria-label="Configuração da residência"
          >
            <article className="settings-card">
              <p className="eyebrow">Pessoas</p>
              <h2>{household.members.length} de 2 membros</h2>
              <ul className="member-list">
                {household.members.map((member) => (
                  <li key={member.userId}>
                    <span>{member.displayName}</span>
                    <small>
                      {member.role === "owner" ? "Proprietário" : "Membro"}
                    </small>
                  </li>
                ))}
              </ul>
              {household.role === "owner" && household.members.length < 2 && (
                <form className="stack-form compact" onSubmit={invite}>
                  <label>
                    Convidar por e-mail
                    <input name="email" type="email" required maxLength={254} />
                  </label>
                  <button className="secondary-button" disabled={busy}>
                    {busy ? "Enviando…" : "Enviar convite"}
                  </button>
                </form>
              )}
            </article>
            <article className="settings-card">
              <p className="eyebrow">Seu perfil</p>
              <h2>{currentDisplayName}</h2>
              <form className="stack-form compact" onSubmit={updateProfile}>
                <label>
                  Nome de exibição
                  <input
                    name="displayName"
                    defaultValue={currentDisplayName}
                    required
                    maxLength={120}
                  />
                </label>
                <button className="secondary-button" disabled={busy}>
                  Salvar perfil
                </button>
              </form>
            </article>
            {import.meta.env.VITE_GOOGLE_CALENDAR_ENABLED !== "false" && (
              <GoogleCalendarSettings gateway={gateway} />
            )}
            {!taskMvp && <TelegramSettings gateway={gateway} />}
            <p className="muted">Versão: tasks-google-calendar-ui-2026.10.30.1</p>
          </section>
        </div>
      )}
      <nav className="bottom-nav" aria-label="Navegação principal">
        {!taskMvp && (
          <a className={page === "home" ? "active" : undefined} href="#inicio">
            Início
          </a>
        )}
        <a className={page === "tasks" ? "active" : undefined} href="#tarefas">
          Tarefas
        </a>
        {!taskMvp && (
          <a
            className={page === "finance" ? "active" : undefined}
            href="#financas"
          >
            Finanças
          </a>
        )}
        <a
          className={page === "settings" ? "active" : undefined}
          href="#configuracoes"
        >
          Ajustes
        </a>
      </nav>
    </main>
  );
}

function ExistingHouseholdInvitation({
  gateway,
  invitationId,
  onContinue,
}: {
  gateway: AppGateway;
  invitationId: string;
  onContinue: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <main className="center-shell">
      <section className="auth-card">
        <h1>Você já pertence a uma residência</h1>
        <p>
          Este convite não transfere sua conta nem suas tarefas para outra casa.
        </p>
        {failed && (
          <p role="alert">
            Não foi possível aceitar o convite. Se a residência atual foi criada
            por engano, o vínculo precisa ser corrigido com suporte, preservando
            seus dados.
          </p>
        )}
        <button
          className="primary-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setFailed(false);
            try {
              await gateway.acceptInvitation(invitationId);
              await onContinue();
            } catch {
              setFailed(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          Verificar convite
        </button>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void onContinue()}
        >
          Continuar na residência atual
        </button>
      </section>
    </main>
  );
}

export function App({ gateway = defaultGateway }: AppProps) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [household, setHousehold] = useState<HouseholdContext | null>(null);
  const [recovery, setRecovery] = useState(false);
  const loadGeneration = useRef(0);
  const [invitationId, setInvitationId] = useState(invitationIdFromUrl);

  const reload = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    try {
      const currentUser = await gateway.getSession();
      if (generation !== loadGeneration.current) return;
      setUser(currentUser);
      setHousehold(null);
      if (!currentUser) return;

      const currentHousehold = await gateway.loadHousehold();
      if (generation === loadGeneration.current) {
        setHousehold(currentHousehold);
      }
    } catch {
      if (generation === loadGeneration.current) {
        setUser(null);
        setHousehold(null);
      }
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [gateway]);

  useEffect(() => {
    if (!gateway.isConfigured) {
      setLoading(false);
      return;
    }
    void reload();
    const unsubscribe = gateway.onAuthStateChange(
      ({ event, user: nextUser }) => {
        if (event === "TOKEN_REFRESHED") return;
        if (event === "SIGNED_OUT") clearTaskSnapshots();
        const generation = ++loadGeneration.current;
        setLoading(true);
        setRecovery(event === "PASSWORD_RECOVERY");
        setUser(nextUser);
        setHousehold(null);
        if (nextUser) {
          void gateway
            .loadHousehold()
            .then((nextHousehold) => {
              if (generation === loadGeneration.current) {
                setHousehold(nextHousehold);
                setLoading(false);
              }
            })
            .catch(() => {
              if (generation === loadGeneration.current) {
                setHousehold(null);
                setLoading(false);
              }
            });
        } else {
          setLoading(false);
        }
      },
    );
    return () => {
      ++loadGeneration.current;
      unsubscribe();
    };
  }, [gateway, reload]);

  if (!gateway.isConfigured)
    return (
      <main className="center-shell">
        <section className="auth-card">
          <p className="eyebrow">Configuração necessária</p>
          <h1>Conecte o Supabase</h1>
          <p className="muted">
            Preencha apenas as variáveis públicas VITE_SUPABASE_URL e
            VITE_SUPABASE_ANON_KEY.
          </p>
        </section>
      </main>
    );
  if (loading)
    return (
      <main className="center-shell">
        <p role="status">Carregando sua casa…</p>
      </main>
    );
  if (recovery)
    return (
      <RecoveryPanel
        gateway={gateway}
        invitationId={invitationId}
        onComplete={async () => {
          setInvitationId(null);
          setRecovery(false);
          await reload();
        }}
      />
    );
  if (!user) return <AuthPanel gateway={gateway} />;
  if (household && invitationId)
    return (
      <ExistingHouseholdInvitation
        gateway={gateway}
        invitationId={invitationId}
        onContinue={async () => {
          clearJoinFromUrl();
          setInvitationId(null);
          await reload();
        }}
      />
    );
  if (!household)
    return (
      <OnboardingPanel
        gateway={gateway}
        invitationId={invitationId}
        onReady={async () => {
          setInvitationId(null);
          await reload();
        }}
      />
    );
  return (
    <Dashboard
      gateway={gateway}
      user={user}
      household={household}
      onReload={reload}
    />
  );
}
