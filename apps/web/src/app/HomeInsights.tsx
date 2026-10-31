import type { Task } from "@gabio/contracts";
import { useEffect, useMemo, useState } from "react";

import type { AppGateway, FinanceSnapshot } from "../lib/app-gateway.js";

const emptyFinance: FinanceSnapshot = {
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
  recurrences: [],
};
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function HomeInsights({ gateway }: { gateway: AppGateway }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [finance, setFinance] = useState(emptyFinance);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([gateway.listTasks(), gateway.loadFinance()])
      .then(([nextTasks, nextFinance]) => {
        if (!active) return;
        setTasks(nextTasks);
        setFinance(nextFinance);
        setFailed(false);
      })
      .catch(() => active && setFailed(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [gateway]);

  const taskCounts = useMemo(
    () => ({
      open: tasks.filter((task) => task.status === "open").length,
      inProgress: tasks.filter((task) => task.status === "in_progress").length,
      completed: tasks.filter((task) => task.status === "completed").length,
    }),
    [tasks],
  );
  const activeTasks = taskCounts.open + taskCounts.inProgress;
  const taskTotal = activeTasks + taskCounts.completed || 1;
  const months = useMemo(
    () =>
      Array.from({ length: 6 }, (_, index) => {
        const date = new Date();
        date.setDate(1);
        date.setMonth(date.getMonth() - (5 - index));
        return {
          key: monthKey(date),
          label: new Intl.DateTimeFormat("pt-BR", { month: "short" })
            .format(date)
            .replace(".", ""),
        };
      }),
    [],
  );
  const cashFlow = months.map((month) => {
    const transactions = finance.transactions.filter(
      (item) =>
        item.status === "posted" && item.occurredOn.startsWith(month.key),
    );
    return {
      ...month,
      income: transactions
        .filter((item) => item.direction === "income")
        .reduce((total, item) => total + Number(item.amountMinor), 0),
      expense: transactions
        .filter((item) => item.direction === "expense")
        .reduce((total, item) => total + Number(item.amountMinor), 0),
    };
  });
  const current = cashFlow.at(-1) ?? { income: 0, expense: 0 };
  const largestValue = Math.max(
    1,
    ...cashFlow.flatMap((month) => [month.income, month.expense]),
  );

  if (loading || failed) {
    return (
      <section
        className="home-insights"
        aria-label="Indicadores da casa"
        aria-busy={loading}
      >
        <p
          className="glass-surface insight-state"
          role={failed ? "alert" : "status"}
        >
          {failed
            ? "Não foi possível carregar os indicadores da casa."
            : "Carregando indicadores…"}
        </p>
      </section>
    );
  }

  return (
    <section
      className="home-insights"
      aria-label="Indicadores da casa"
      aria-busy={loading}
    >
      <article className="insight-card glass-surface tasks-insight">
        <div className="insight-heading">
          <div>
            <h2>Tarefas</h2>
            <p className="insight-value">
              {activeTasks} <span>ativas</span>
            </p>
          </div>
          <a href="#tarefas">
            Ver tarefas <span aria-hidden="true">↗</span>
          </a>
        </div>
        {tasks.length === 0 && (
          <p className="insight-empty">Nenhuma tarefa cadastrada.</p>
        )}
        <div className="task-progress" aria-hidden="true">
          <i
            className="open"
            style={{ width: `${(taskCounts.open / taskTotal) * 100}%` }}
          />
          <i
            className="in-progress"
            style={{ width: `${(taskCounts.inProgress / taskTotal) * 100}%` }}
          />
          <i
            className="completed"
            style={{ width: `${(taskCounts.completed / taskTotal) * 100}%` }}
          />
        </div>
        <dl className="task-stat-list">
          <div>
            <dt>A fazer</dt>
            <dd>{taskCounts.open}</dd>
          </div>
          <div>
            <dt>Em andamento</dt>
            <dd>{taskCounts.inProgress}</dd>
          </div>
          <div>
            <dt>Concluídas</dt>
            <dd>{taskCounts.completed}</dd>
          </div>
        </dl>
      </article>
      <article className="insight-card glass-surface finance-insight">
        <div className="insight-heading">
          <div>
            <h2>Finanças</h2>
            <p className="insight-value">
              {money.format((current.income - current.expense) / 100)}
            </p>
            <p className="insight-caption">Resultado do mês</p>
          </div>
          <a href="#financas">
            Ver finanças <span aria-hidden="true">↗</span>
          </a>
        </div>
        {cashFlow.some((month) => month.income > 0 || month.expense > 0) ? (
          <div
            className="cash-chart"
            aria-label="Entradas e saídas dos últimos seis meses"
          >
            {cashFlow.map((month) => (
              <div className="cash-month" key={month.key}>
                <div aria-hidden="true">
                  <i
                    className="income"
                    style={{
                      height: `${Math.max(3, (month.income / largestValue) * 100)}%`,
                    }}
                  />
                  <i
                    className="expense"
                    style={{
                      height: `${Math.max(3, (month.expense / largestValue) * 100)}%`,
                    }}
                  />
                </div>
                <span>{month.label}</span>
                <span className="sr-only">
                  {month.key}: entradas {money.format(month.income / 100)};
                  saídas {money.format(month.expense / 100)}.
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="insight-empty">
            Nenhum lançamento nos últimos seis meses.
          </p>
        )}
        <div className="finance-legend">
          <span className="income">
            Entradas {money.format(current.income / 100)}
          </span>
          <span className="expense">
            Saídas {money.format(current.expense / 100)}
          </span>
        </div>
      </article>
    </section>
  );
}
