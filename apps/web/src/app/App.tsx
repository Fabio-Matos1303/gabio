const overview = [
  {
    id: "tarefas",
    label: "Tarefas abertas",
    value: "—",
    hint: "Conecte sua casa",
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

export function App() {
  const today = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Bahia",
  }).format(new Date());

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="Gabio, início">
          <span className="brand-mark" aria-hidden="true">
            G
          </span>
          <span>gabio</span>
        </a>
        <button
          className="profile-button"
          type="button"
          aria-label="Abrir perfil"
          title="Disponível após o login"
          disabled
        >
          Eu
        </button>
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

      <section aria-labelledby="resumo-title">
        <div className="section-heading">
          <h2 id="resumo-title">Hoje</h2>
          <span className="status-pill">Configuração inicial</span>
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
          <button className="text-button" type="button" disabled>
            Usar texto natural
          </button>
        </div>
        <div className="action-grid">
          {actions.map((action) => (
            <button
              className="action-card"
              type="button"
              key={action.title}
              disabled
              title="Disponível após conectar a residência"
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

      <section className="inbox-card" aria-labelledby="inbox-title">
        <div>
          <p className="eyebrow">Caixa de entrada</p>
          <h2 id="inbox-title">Diga o que precisa acontecer</h2>
          <p>Ex.: “Gastei 82 reais no mercado ontem”</p>
        </div>
        <form className="composer" aria-describedby="composer-status">
          <label className="sr-only" htmlFor="natural-input">
            Mensagem
          </label>
          <input
            id="natural-input"
            placeholder="Escreva em linguagem natural…"
            disabled
          />
          <button type="submit" disabled>
            Enviar
          </button>
        </form>
        <p className="setup-note" id="composer-status" role="status">
          Entrada desativada até login e sincronização estarem conectados.
        </p>
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
