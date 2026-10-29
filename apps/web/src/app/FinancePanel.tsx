import {
  financeGatewayCommandSchema,
  type FinanceCommandProposal,
  type FinanceGatewayCommand,
} from "@gabio/contracts";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { AppGateway, FinanceSnapshot } from "../lib/app-gateway.js";
import { downloadFinanceExport } from "../lib/finance-export.js";

type Notice = { kind: "success" | "error"; text: string } | null;
type FinanceArea = "overview" | "transactions" | "parameters" | "planning";
const empty: FinanceSnapshot = {
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
  recurrences: [],
};
export const formatMinor = (value: bigint | number | string) => {
  const minor = BigInt(value);
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  return `${negative ? "−" : ""}R$ ${(absolute / 100n).toLocaleString("pt-BR")},${String(absolute % 100n).padStart(2, "0")}`;
};
export const monthKeyInHouseholdTimezone = (date: Date) => {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Bahia",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
};
const cents = (value: FormDataEntryValue | null) =>
  Math.round(Number(String(value).replace(",", ".")) * 100);
const reviewLabels: Record<string, string> = {
  operation: "Operação",
  description: "Descrição",
  accountName: "Conta",
  categoryName: "Categoria",
  direction: "Tipo",
  amountMinor: "Valor",
  date: "Data",
  visibility: "Visibilidade",
  installmentCount: "Parcelas",
  targetId: "Identificador do recurso",
  targetType: "Tipo de recurso",
  targetName: "Recurso afetado",
  originalAccountName: "Conta original",
  originalDirection: "Tipo original",
  originalAmountMinor: "Valor original",
  originalDate: "Data original",
};
const accountTypeLabels: Record<string, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Dinheiro",
  credit_card: "Cartão",
  other: "Outra",
};
const categoryKindLabels: Record<string, string> = {
  income: "Receita",
  expense: "Despesa",
  both: "Receita e despesa",
};

export function FinancePanel({ gateway }: { gateway: AppGateway }) {
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [area, setArea] = useState<FinanceArea>("overview");
  const [mode, setMode] = useState("transaction");
  const [proposal, setProposal] = useState<FinanceCommandProposal | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await gateway.loadFinance());
    } catch {
      setNotice({
        kind: "error",
        text: "Não foi possível carregar os dados financeiros.",
      });
    } finally {
      setLoading(false);
    }
  }, [gateway]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const balance = useMemo(
    () =>
      data.transactions.reduce((sum, item) => {
        const value = BigInt(item.amountMinor);
        return sum + (item.direction === "income" ? value : -value);
      }, 0n),
    [data.transactions],
  );
  const reversedTransactionIds = useMemo(
    () =>
      new Set(
        data.transactions.flatMap((item) =>
          item.reversalOfId ? [item.reversalOfId] : [],
        ),
      ),
    [data.transactions],
  );
  const activeAccounts = useMemo(
    () => data.accounts.filter((account) => !account.isArchived),
    [data.accounts],
  );
  const activeCategories = useMemo(
    () => data.categories.filter((category) => !category.isArchived),
    [data.categories],
  );
  const monthKey = monthKeyInHouseholdTimezone(new Date());
  const currentMonthTransactions = useMemo(
    () =>
      data.transactions.filter(
        (item) =>
          item.occurredOn.startsWith(monthKey) &&
          (item.status !== "reversed" || reversedTransactionIds.has(item.id)),
      ),
    [data.transactions, monthKey, reversedTransactionIds],
  );
  const transactionsById = useMemo(
    () => new Map(data.transactions.map((item) => [item.id, item])),
    [data.transactions],
  );
  const monthIncome = useMemo(
    () =>
      currentMonthTransactions.reduce((total, item) => {
        const original = item.reversalOfId
          ? transactionsById.get(item.reversalOfId)
          : null;
        if (original?.direction === "income")
          return total - BigInt(item.amountMinor);
        if (!item.reversalOfId && item.direction === "income")
          return total + BigInt(item.amountMinor);
        return total;
      }, 0n),
    [currentMonthTransactions, transactionsById],
  );
  const monthExpense = useMemo(
    () =>
      currentMonthTransactions.reduce((total, item) => {
        const original = item.reversalOfId
          ? transactionsById.get(item.reversalOfId)
          : null;
        if (original?.direction === "expense")
          return total - BigInt(item.amountMinor);
        if (!item.reversalOfId && item.direction === "expense")
          return total + BigInt(item.amountMinor);
        return total;
      }, 0n),
    [currentMonthTransactions, transactionsById],
  );
  const categorySpending = useMemo(() => {
    const totals = new Map<string, { name: string; amount: bigint }>();
    currentMonthTransactions.forEach((item) => {
      const original = item.reversalOfId
        ? transactionsById.get(item.reversalOfId)
        : null;
      if ((original?.direction ?? item.direction) !== "expense") return;
      const categoryId = original?.categoryId ?? item.categoryId;
      const key = categoryId ?? "uncategorized";
      const name =
        data.categories.find((category) => category.id === categoryId)?.name ??
        "Sem categoria";
      const effect = item.reversalOfId
        ? -BigInt(item.amountMinor)
        : BigInt(item.amountMinor);
      totals.set(key, {
        name,
        amount: (totals.get(key)?.amount ?? 0n) + effect,
      });
    });
    return [...totals.entries()]
      .map(([id, value]) => ({ id, ...value }))
      .sort((left, right) =>
        left.amount === right.amount ? 0 : left.amount > right.amount ? -1 : 1,
      )
      .slice(0, 5);
  }, [currentMonthTransactions, data.categories, transactionsById]);
  const uncategorizedCount = currentMonthTransactions.filter(
    (item) => !item.reversalOfId && item.categoryId === null,
  ).length;
  const recentTransactions = data.transactions
    .filter(
      (item) =>
        item.status !== "reversed" || reversedTransactionIds.has(item.id),
    )
    .slice(0, 5);

  async function prepare(command: FinanceGatewayCommand) {
    if (!navigator.onLine) {
      setNotice({
        kind: "error",
        text: "Operações financeiras exigem conexão para revisão e confirmação.",
      });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      setProposal(
        await gateway.prepareFinanceCommand(
          financeGatewayCommandSchema.parse(command),
        ),
      );
    } catch {
      setNotice({
        kind: "error",
        text: "Não foi possível preparar a operação.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const commandId = crypto.randomUUID();
    const visibility = String(form.get("visibility") ?? "household") as
      "household" | "private";
    const accountId = String(form.get("accountId") ?? "");
    const categoryId = String(form.get("categoryId") ?? "") || null;
    let command: FinanceGatewayCommand;
    if (mode === "account")
      command = {
        commandId,
        type: "create_account",
        payload: {
          name: String(form.get("name")),
          accountType: String(form.get("accountType")) as "cash",
          currencyCode: "BRL",
          visibility,
        },
      };
    else if (mode === "category")
      command = {
        commandId,
        type: "create_category",
        payload: {
          name: String(form.get("name")),
          kind: String(form.get("kind")) as "both",
          visibility,
        },
      };
    else if (mode === "budget")
      command = {
        commandId,
        type: "set_budget",
        payload: {
          categoryId: String(categoryId),
          month: `${String(form.get("month"))}-01`,
          amountMinor: cents(form.get("amount")),
          currencyCode: "BRL",
          visibility,
        },
      };
    else if (mode === "recurrence")
      command = {
        commandId,
        type: "create_recurrence",
        payload: {
          accountId,
          categoryId,
          direction: String(form.get("direction")) as "expense",
          amountMinor: cents(form.get("amount")),
          currencyCode: "BRL",
          description: String(form.get("description")),
          frequency: String(form.get("frequency")) as "monthly",
          nextDueOn: String(form.get("date")),
          visibility,
        },
      };
    else if (mode === "installment")
      command = {
        commandId,
        type: "create_installment_plan",
        payload: {
          accountId,
          categoryId,
          description: String(form.get("description")),
          totalAmountMinor: cents(form.get("amount")),
          installmentCount: Number(form.get("installmentCount")),
          currencyCode: "BRL",
          firstDueOn: String(form.get("date")),
          visibility,
        },
      };
    else
      command = {
        commandId,
        type: "create_transaction",
        payload: {
          accountId,
          categoryId,
          direction: String(form.get("direction")) as "expense",
          amountMinor: cents(form.get("amount")),
          currencyCode: "BRL",
          description: String(form.get("description")),
          occurredOn: String(form.get("date")),
          visibility,
        },
      };
    await prepare(command);
  }

  async function confirm() {
    if (!proposal) return;
    setBusy(true);
    try {
      await gateway.confirmFinanceCommand({
        commandId: proposal.commandId,
        proposalId: proposal.proposalId,
        confirmationHash: proposal.commandHash,
      });
      setProposal(null);
      setNotice({ kind: "success", text: "Operação financeira confirmada." });
      await reload();
    } catch {
      setNotice({
        kind: "error",
        text: "A confirmação expirou ou os dados mudaram. Revise novamente.",
      });
    } finally {
      setBusy(false);
    }
  }

  const exportRows = data.transactions.map((item) => ({
    date: item.occurredOn,
    description: item.description,
    account:
      data.accounts.find((a) => a.id === item.accountId)?.name ?? "Conta",
    category:
      data.categories.find((c) => c.id === item.categoryId)?.name ?? null,
    direction: item.direction,
    amountMinor: BigInt(item.amountMinor),
    currencyCode: item.currencyCode,
    visibility: item.visibility,
    status: item.status,
  }));
  const needsAccount = ["transaction", "recurrence", "installment"].includes(
    mode,
  );
  const needsValue = !["account", "category"].includes(mode);
  function changeArea(nextArea: FinanceArea) {
    setArea(nextArea);
    setMode(
      nextArea === "overview" || nextArea === "transactions"
        ? "transaction"
        : nextArea === "parameters"
          ? "account"
          : "budget",
    );
    setNotice(null);
  }

  function renameAccount(id: string, version: number, currentName: string) {
    const name = window.prompt("Novo nome da conta", currentName)?.trim();
    if (!name || name === currentName) return;
    void prepare({
      commandId: crypto.randomUUID(),
      type: "update_account",
      payload: { accountId: id, expectedVersion: version, name },
    });
  }

  function renameCategory(id: string, version: number, currentName: string) {
    const name = window.prompt("Novo nome da categoria", currentName)?.trim();
    if (!name || name === currentName) return;
    void prepare({
      commandId: crypto.randomUUID(),
      type: "update_category",
      payload: { categoryId: id, expectedVersion: version, name },
    });
  }

  return (
    <section
      className="finance-section"
      id="financas"
      aria-labelledby="finance-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Finanças</p>
          <h2 id="finance-title">Gestão financeira</h2>
        </div>
        <strong>{formatMinor(balance)}</strong>
      </div>
      {notice && (
        <p
          className={`notice ${notice.kind}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}
      <nav className="finance-tabs" aria-label="Seções financeiras">
        <button
          type="button"
          className={area === "overview" ? "active" : undefined}
          aria-pressed={area === "overview"}
          onClick={() => changeArea("overview")}
        >
          Visão geral
        </button>
        <button
          type="button"
          className={area === "transactions" ? "active" : undefined}
          aria-pressed={area === "transactions"}
          onClick={() => changeArea("transactions")}
        >
          Lançamentos
        </button>
        <button
          type="button"
          className={area === "parameters" ? "active" : undefined}
          aria-pressed={area === "parameters"}
          onClick={() => changeArea("parameters")}
        >
          Cadastros
        </button>
        <button
          type="button"
          className={area === "planning" ? "active" : undefined}
          aria-pressed={area === "planning"}
          onClick={() => changeArea("planning")}
        >
          Planejamento
        </button>
      </nav>
      {area === "overview" && (
        <section className="finance-overview" aria-label="Resumo financeiro">
          <div className="finance-overview-heading">
            <div>
              <p className="eyebrow">Seu mês em contexto</p>
              <h3>O que merece sua atenção</h3>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => changeArea("transactions")}
            >
              Registrar lançamento
            </button>
          </div>
          <div className="finance-summary-grid">
            <article>
              <span>Entradas do mês</span>
              <strong className="income">{formatMinor(monthIncome)}</strong>
            </article>
            <article>
              <span>Saídas do mês</span>
              <strong className="expense">{formatMinor(monthExpense)}</strong>
            </article>
            <article>
              <span>Resultado do mês</span>
              <strong
                className={
                  monthIncome - monthExpense >= 0n ? "income" : "expense"
                }
              >
                {formatMinor(monthIncome - monthExpense)}
              </strong>
            </article>
          </div>
          <div className="finance-overview-columns">
            <article className="finance-breakdown-card">
              <div className="overview-card-heading">
                <div>
                  <p className="eyebrow">Resumo calculado</p>
                  <h3>Gastos por categoria</h3>
                </div>
                <span>{currentMonthTransactions.length} lançamentos</span>
              </div>
              {categorySpending.length === 0 ? (
                <p className="muted">
                  Registre despesas para visualizar a distribuição do mês.
                </p>
              ) : (
                <div className="category-breakdown">
                  {categorySpending.map(({ id, name, amount }) => {
                    const positiveAmount = amount > 0n ? amount : 0n;
                    const positiveTotal = monthExpense > 0n ? monthExpense : 1n;
                    const percentage =
                      Number((positiveAmount * 10_000n) / positiveTotal) / 100;
                    return (
                      <div key={id}>
                        <div>
                          <span>{name}</span>
                          <strong>{formatMinor(amount)}</strong>
                        </div>
                        <progress value={percentage} max={100}>
                          {percentage}%
                        </progress>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
            <article className="finance-attention-card">
              <p className="eyebrow">Itens para revisar</p>
              <h3>Pendências</h3>
              <button type="button" onClick={() => changeArea("transactions")}>
                <span>Lançamentos sem categoria</span>
                <strong>{uncategorizedCount}</strong>
              </button>
              <button type="button" onClick={() => changeArea("planning")}>
                <span>Recorrências cadastradas</span>
                <strong>{data.recurrences.length}</strong>
              </button>
              <button type="button" onClick={() => changeArea("parameters")}>
                <span>Contas ativas</span>
                <strong>{activeAccounts.length}</strong>
              </button>
            </article>
          </div>
          <article className="recent-finance-card">
            <div className="overview-card-heading">
              <div>
                <p className="eyebrow">Movimentações</p>
                <h3>Lançamentos recentes</h3>
              </div>
              <button type="button" onClick={() => changeArea("transactions")}>
                Ver todos
              </button>
            </div>
            {recentTransactions.length === 0 ? (
              <p className="muted">Nenhum lançamento visível.</p>
            ) : (
              <div className="overview-transaction-list">
                {recentTransactions.map((item) => (
                  <div key={item.id}>
                    <span>
                      <strong>{item.description}</strong>
                      <small>
                        {data.categories.find(
                          (category) => category.id === item.categoryId,
                        )?.name ?? "Sem categoria"}
                        {" · "}
                        {item.occurredOn}
                      </small>
                    </span>
                    <strong className={item.direction}>
                      {item.direction === "expense" ? "−" : "+"}
                      {formatMinor(item.amountMinor)}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      )}
      {area !== "overview" && (
        <>
          <div className="finance-toolbar">
            <label>
              {area === "transactions"
                ? "Novo lançamento"
                : area === "parameters"
                  ? "Novo cadastro"
                  : "Novo planejamento"}
              <select
                aria-label="Nova operação"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                {area === "transactions" && (
                  <option value="transaction">Receita ou despesa</option>
                )}
                {area === "parameters" && (
                  <>
                    <option value="account">Conta</option>
                    <option value="category">Categoria</option>
                  </>
                )}
                {area === "planning" && (
                  <>
                    <option value="budget">Orçamento</option>
                    <option value="recurrence">Recorrência</option>
                    <option value="installment">Parcelamento</option>
                  </>
                )}
              </select>
            </label>
            <div>
              <button
                onClick={() => downloadFinanceExport("json", exportRows)}
                disabled={!exportRows.length}
              >
                Exportar JSON
              </button>
              <button
                onClick={() => downloadFinanceExport("csv", exportRows)}
                disabled={!exportRows.length}
              >
                Exportar CSV
              </button>
            </div>
          </div>
          <form className="finance-form" onSubmit={submit}>
            {(mode === "account" || mode === "category") && (
              <label>
                Nome
                <input name="name" required maxLength={120} />
              </label>
            )}
            {mode === "account" && (
              <label>
                Tipo
                <select name="accountType">
                  <option value="checking">Conta corrente</option>
                  <option value="savings">Poupança</option>
                  <option value="cash">Dinheiro</option>
                  <option value="credit_card">Cartão</option>
                  <option value="other">Outra</option>
                </select>
              </label>
            )}
            {mode === "category" && (
              <label>
                Finalidade
                <select name="kind">
                  <option value="both">Receita e despesa</option>
                  <option value="expense">Despesa</option>
                  <option value="income">Receita</option>
                </select>
              </label>
            )}
            {needsAccount && (
              <label>
                Conta
                <select name="accountId" required>
                  <option value="">Selecione</option>
                  {activeAccounts.map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {needsValue && (
              <>
                <label>
                  Categoria
                  <select name="categoryId" required={mode === "budget"}>
                    <option value="">Sem categoria</option>
                    {activeCategories.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Valor (R$)
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    max="90071992547409.91"
                    step="0.01"
                    required
                  />
                </label>
              </>
            )}
            {["transaction", "recurrence"].includes(mode) && (
              <label>
                Tipo
                <select name="direction">
                  <option value="expense">Despesa</option>
                  <option value="income">Receita</option>
                </select>
              </label>
            )}
            {["transaction", "recurrence", "installment"].includes(mode) && (
              <label>
                Descrição
                <input name="description" required maxLength={500} />
              </label>
            )}
            {mode === "budget" && (
              <label>
                Mês
                <input name="month" type="month" required />
              </label>
            )}
            {["transaction", "recurrence", "installment"].includes(mode) && (
              <label>
                {mode === "transaction" ? "Data" : "Primeira data"}
                <input name="date" type="date" required />
              </label>
            )}
            {mode === "recurrence" && (
              <label>
                Frequência
                <select name="frequency">
                  <option value="monthly">Mensal</option>
                  <option value="weekly">Semanal</option>
                  <option value="yearly">Anual</option>
                </select>
              </label>
            )}
            {mode === "installment" && (
              <label>
                Parcelas
                <input
                  name="installmentCount"
                  type="number"
                  min="2"
                  max="120"
                  required
                />
              </label>
            )}
            <label>
              Visibilidade
              <select name="visibility">
                <option value="household">Compartilhada</option>
                <option value="private">Privada</option>
              </select>
            </label>
            <button className="primary-button" disabled={busy || loading}>
              {busy ? "Preparando…" : "Revisar operação"}
            </button>
          </form>
        </>
      )}
      {area === "parameters" && (
        <section
          className="finance-parameters"
          aria-label="Parâmetros dos lançamentos"
        >
          <div className="parameter-heading">
            <div>
              <p className="eyebrow">Parâmetros</p>
              <h3>Contas</h3>
            </div>
            <small>Define onde o dinheiro entra ou sai.</small>
          </div>
          <div className="parameter-grid">
            {activeAccounts.length === 0 ? (
              <p className="muted">Nenhuma conta cadastrada.</p>
            ) : (
              activeAccounts.map((account) => (
                <article key={account.id} className="parameter-card">
                  <div>
                    <strong>{account.name}</strong>
                    <small>
                      {accountTypeLabels[account.accountType] ??
                        account.accountType}{" "}
                      ·{" "}
                      {account.visibility === "private"
                        ? "Privada"
                        : "Compartilhada"}
                    </small>
                  </div>
                  <div className="parameter-actions">
                    <button
                      type="button"
                      onClick={() =>
                        renameAccount(account.id, account.version, account.name)
                      }
                    >
                      Renomear
                    </button>
                    <button
                      type="button"
                      className="danger-text"
                      onClick={() =>
                        void prepare({
                          commandId: crypto.randomUUID(),
                          type: "archive_account",
                          payload: {
                            accountId: account.id,
                            expectedVersion: account.version,
                          },
                        })
                      }
                    >
                      Arquivar
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
          <div className="parameter-heading">
            <div>
              <p className="eyebrow">Classificação</p>
              <h3>Categorias</h3>
            </div>
            <small>Explica para onde o dinheiro foi ou de onde veio.</small>
          </div>
          <div className="parameter-grid">
            {activeCategories.length === 0 ? (
              <p className="muted">Nenhuma categoria cadastrada.</p>
            ) : (
              activeCategories.map((category) => (
                <article key={category.id} className="parameter-card">
                  <div>
                    <strong>{category.name}</strong>
                    <small>
                      {categoryKindLabels[category.kind]} ·{" "}
                      {category.visibility === "private"
                        ? "Privada"
                        : "Compartilhada"}
                    </small>
                  </div>
                  <div className="parameter-actions">
                    <button
                      type="button"
                      onClick={() =>
                        renameCategory(
                          category.id,
                          category.version,
                          category.name,
                        )
                      }
                    >
                      Renomear
                    </button>
                    <button
                      type="button"
                      className="danger-text"
                      onClick={() =>
                        void prepare({
                          commandId: crypto.randomUUID(),
                          type: "archive_category",
                          payload: {
                            categoryId: category.id,
                            expectedVersion: category.version,
                          },
                        })
                      }
                    >
                      Arquivar
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
          <aside className="finance-model-note">
            <strong>Tipos de lançamento</strong>
            <p>
              Receita e despesa são tipos estruturais. Contas e categorias são
              personalizáveis e podem ser reutilizadas em todos os lançamentos.
            </p>
          </aside>
        </section>
      )}
      {area === "transactions" && (
        <div className="finance-list" aria-live="polite">
          {loading ? (
            <p>Carregando finanças…</p>
          ) : data.transactions.length === 0 ? (
            <p className="muted">Nenhum lançamento visível.</p>
          ) : (
            data.transactions.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.description}</strong>
                  <small>
                    {item.occurredOn} ·{" "}
                    {item.visibility === "private"
                      ? "Privado"
                      : "Compartilhado"}
                  </small>
                </div>
                <strong className={item.direction}>
                  {item.direction === "expense" ? "−" : "+"}
                  {formatMinor(item.amountMinor)}
                </strong>
                {item.status === "posted" &&
                  !item.reversalOfId &&
                  !reversedTransactionIds.has(item.id) && (
                    <button
                      onClick={() => {
                        const reason = window.prompt("Motivo do estorno");
                        if (reason)
                          void prepare({
                            commandId: crypto.randomUUID(),
                            type: "reverse_transaction",
                            payload: { transactionId: item.id, reason },
                          });
                      }}
                    >
                      Estornar
                    </button>
                  )}
              </article>
            ))
          )}
        </div>
      )}
      {proposal && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <p className="eyebrow">Confirmação obrigatória</p>
            <h3 id="confirm-title">Revise antes de confirmar</h3>
            <p>{proposal.summary}</p>
            <dl className="finance-review">
              {Object.entries(proposal.review).map(([key, value]) => (
                <div key={key}>
                  <dt>{reviewLabels[key] ?? key}</dt>
                  <dd>
                    {key === "amountMinor" || key === "originalAmountMinor"
                      ? formatMinor(String(value))
                      : key === "direction" || key === "originalDirection"
                        ? value === "income"
                          ? "Receita"
                          : "Despesa"
                        : key === "visibility"
                          ? value === "private"
                            ? "Privada"
                            : "Compartilhada"
                          : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
            <div>
              <button onClick={() => setProposal(null)} disabled={busy}>
                Cancelar
              </button>
              <button
                className="primary-button"
                onClick={() => void confirm()}
                disabled={busy}
              >
                Confirmar operação
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
