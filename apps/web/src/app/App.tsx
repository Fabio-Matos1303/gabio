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
import { defaultGateway } from "../lib/supabase-gateway.js";

type AppProps = { gateway?: AppGateway };
type Notice = { kind: "success" | "error"; text: string } | null;

const actions = [
  { icon: "✓", title: "Nova tarefa", description: "Organize algo da rotina" },
  {
    icon: "R$",
    title: "Novo lançamento",
    description: "Registre uma movimentação",
  },
  {
    icon: "+",
    title: "Novo compromisso",
    description: "Verifique conflitos primeiro",
  },
];

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
  invitationId,
  onReady,
}: {
  gateway: AppGateway;
  invitationId: string | null;
  onReady: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

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
        <h1>{invitationId ? "Entrar na residência" : "Crie sua residência"}</h1>
        <p className="muted">
          {invitationId
            ? "Confirme para entrar com a identidade vinculada a este convite."
            : "Você será o proprietário e poderá convidar a segunda pessoa depois."}
        </p>
        <NoticeBox notice={notice} />
        {invitationId ? (
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
  const overview = [
    {
      id: "tarefas",
      label: "Tarefas abertas",
      value: "—",
      hint: "M2: tarefas ponta a ponta",
    },
    {
      id: "financas",
      label: "Saldo do mês",
      value: "—",
      hint: "Privacidade por conta",
    },
    {
      id: "agenda",
      label: "Próximo compromisso",
      value: "—",
      hint: "Google Agenda",
    },
  ];

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
        <a className="brand" href="#inicio" aria-label="Gabio, início">
          <span className="brand-mark" aria-hidden="true">
            G
          </span>
          <span>gabio</span>
        </a>
        <div className="account-actions">
          <span>{household.name}</span>
          <button className="profile-button" type="button" title={user.email}>
            {currentDisplayName.slice(0, 2).toUpperCase()}
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => void gateway.signOut()}
          >
            Sair
          </button>
        </div>
      </header>
      <section className="hero" id="inicio">
        <p className="eyebrow">{today}</p>
        <h1>
          A casa em ordem,
          <br />
          sem virar trabalho.
        </h1>
        <p className="hero-copy">
          Tarefas, dinheiro e agenda em um só lugar — com privacidade para o que
          é seu.
        </p>
      </section>
      <NoticeBox notice={notice} />
      <section aria-labelledby="resumo-title">
        <div className="section-heading">
          <h2 id="resumo-title">Hoje</h2>
          <span className="status-pill">M1 conectado</span>
        </div>
        <div className="summary-grid">
          {overview.map((item) => (
            <article className="summary-card" id={item.id} key={item.label}>
              <p>{item.label}</p>
              <strong>{item.value}</strong>
              <span>{item.hint}</span>
            </article>
          ))}
        </div>
      </section>
      <section aria-labelledby="acoes-title">
        <div className="section-heading">
          <h2 id="acoes-title">Ações rápidas</h2>
          <span className="muted">Disponíveis no M2</span>
        </div>
        <div className="action-grid">
          {actions.map((action) => (
            <button
              className="action-card"
              type="button"
              key={action.title}
              disabled
              title="Disponível no M2"
            >
              <span className="action-icon" aria-hidden="true">
                {action.icon}
              </span>
              <span>
                <strong>{action.title}</strong>
                <small>{action.description}</small>
              </span>
            </button>
          ))}
        </div>
      </section>
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
      </section>
      <nav className="bottom-nav" aria-label="Navegação principal">
        <a className="active" href="#inicio">
          Início
        </a>
        <a href="#tarefas">Tarefas</a>
        <a href="#financas">Finanças</a>
        <a href="#agenda">Agenda</a>
      </nav>
    </main>
  );
}

export function App({ gateway = defaultGateway }: AppProps) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [household, setHousehold] = useState<HouseholdContext | null>(null);
  const [recovery, setRecovery] = useState(false);
  const loadGeneration = useRef(0);
  const invitationId = useMemo(invitationIdFromUrl, []);

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

  useEffect(() => {
    if (household && invitationId) clearJoinFromUrl();
  }, [household, invitationId]);

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
          setRecovery(false);
          await reload();
        }}
      />
    );
  if (!user) return <AuthPanel gateway={gateway} />;
  if (!household)
    return (
      <OnboardingPanel
        gateway={gateway}
        invitationId={invitationId}
        onReady={reload}
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
