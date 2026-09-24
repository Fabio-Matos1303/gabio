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
const empty: FinanceSnapshot = {
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
  recurrences: [],
};
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
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

export function FinancePanel({ gateway }: { gateway: AppGateway }) {
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
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
        if (item.status === "reversed") return sum;
        const value = Number(item.amountMinor);
        return sum + (item.direction === "income" ? value : -value);
      }, 0),
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
        <strong>{money.format(balance / 100)}</strong>
      </div>
      {notice && (
        <p
          className={`notice ${notice.kind}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}
      <div className="finance-toolbar">
        <label>
          Nova operação
          <select
            aria-label="Nova operação"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="transaction">Lançamento</option>
            <option value="account">Conta</option>
            <option value="category">Categoria</option>
            <option value="budget">Orçamento</option>
            <option value="recurrence">Recorrência</option>
            <option value="installment">Parcelamento</option>
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
              {data.accounts.map((a) => (
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
                {data.categories.map((c) => (
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
                  {item.visibility === "private" ? "Privado" : "Compartilhado"}
                </small>
              </div>
              <strong className={item.direction}>
                {item.direction === "expense" ? "−" : "+"}
                {money.format(Number(item.amountMinor) / 100)}
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
                      ? money.format(Number(value) / 100)
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
              <button onClick={() => setProposal(null)}>Cancelar</button>
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
