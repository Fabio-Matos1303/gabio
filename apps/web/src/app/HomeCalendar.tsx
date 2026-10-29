import type { Task } from "@gabio/contracts";
import { useEffect, useMemo, useState } from "react";

import type {
  AppGateway,
  CalendarEvent,
  FinanceRecurrence,
  FinanceSnapshot,
} from "../lib/app-gateway.js";

type CalendarItem = {
  id: string;
  date: string;
  title: string;
  type: "task" | "event" | "income" | "expense";
  detail: string;
  amountMinor?: number;
  scheduled?: boolean;
};

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
const monthLabel = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});
const shortTime = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

function addOccurrence(date: Date, frequency: FinanceRecurrence["frequency"]) {
  const next = new Date(date);
  if (frequency === "weekly") next.setDate(next.getDate() + 7);
  else if (frequency === "monthly") next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  return next;
}

function recurrenceItems(
  recurrence: FinanceRecurrence,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const items: CalendarItem[] = [];
  let occurrence = parseDateOnly(recurrence.nextDueOn);
  for (let guard = 0; occurrence <= rangeEnd && guard < 400; guard += 1) {
    if (occurrence >= rangeStart)
      items.push({
        id: `${recurrence.id}-${dateKey(occurrence)}`,
        date: dateKey(occurrence),
        title: recurrence.description,
        type: recurrence.direction,
        detail:
          recurrence.direction === "income"
            ? "Entrada prevista"
            : "Saída prevista",
        amountMinor: Number(recurrence.amountMinor),
        scheduled: true,
      });
    occurrence = addOccurrence(occurrence, recurrence.frequency);
  }
  return items;
}

function buildItems(
  tasks: Task[],
  finance: FinanceSnapshot,
  events: CalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date,
) {
  const taskItems: CalendarItem[] = tasks.flatMap((task) =>
    task.dueAt && task.status !== "cancelled"
      ? [
          {
            id: task.id,
            date: dateKey(new Date(task.dueAt)),
            title: task.title,
            type: "task" as const,
            detail:
              task.status === "completed"
                ? "Tarefa concluída"
                : task.status === "in_progress"
                  ? "Tarefa em andamento"
                  : "Tarefa a fazer",
          },
        ]
      : [],
  );
  const eventItems: CalendarItem[] = events.map((event) => ({
    id: event.id,
    date: dateKey(new Date(event.startsAt)),
    title: event.title,
    type: "event",
    detail: `Compromisso · ${shortTime.format(new Date(event.startsAt))}`,
  }));
  const transactionItems: CalendarItem[] = finance.transactions
    .filter((transaction) => transaction.status === "posted")
    .map((transaction) => {
      const scheduled = transaction.occurredOn > dateKey(new Date());
      return {
        id: transaction.id,
        date: transaction.occurredOn,
        title: transaction.description,
        type: transaction.direction,
        detail: `${transaction.direction === "income" ? "Entrada" : "Saída"} ${scheduled ? "programada" : "realizada"}`,
        amountMinor: Number(transaction.amountMinor),
        scheduled,
      };
    });
  return [
    ...taskItems,
    ...eventItems,
    ...transactionItems,
    ...finance.recurrences.flatMap((recurrence) =>
      recurrenceItems(recurrence, rangeStart, rangeEnd),
    ),
  ];
}

export function HomeCalendar({ gateway }: { gateway: AppGateway }) {
  const now = useMemo(() => new Date(), []);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(now.getFullYear(), now.getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(() => dateKey(now));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [finance, setFinance] = useState(emptyFinance);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      gateway.listTasks(),
      gateway.loadFinance(),
      gateway.listCalendarEvents(),
    ])
      .then(([nextTasks, nextFinance, nextEvents]) => {
        if (!active) return;
        setTasks(nextTasks);
        setFinance(nextFinance);
        setEvents(nextEvents);
        setFailed(false);
      })
      .catch(() => active && setFailed(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [gateway]);

  const rangeStart = useMemo(
    () => new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1),
    [visibleMonth],
  );
  const rangeEnd = useMemo(
    () =>
      new Date(
        visibleMonth.getFullYear(),
        visibleMonth.getMonth() + 1,
        0,
        23,
        59,
        59,
      ),
    [visibleMonth],
  );
  const items = useMemo(
    () => buildItems(tasks, finance, events, rangeStart, rangeEnd),
    [events, finance, rangeEnd, rangeStart, tasks],
  );
  const cells = useMemo(() => {
    const firstWeekday = rangeStart.getDay();
    const firstCell = new Date(rangeStart);
    firstCell.setDate(firstCell.getDate() - firstWeekday);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(firstCell);
      date.setDate(firstCell.getDate() + index);
      return date;
    });
  }, [rangeStart]);
  const selectedItems = items.filter((item) => item.date === selectedDate);
  const monthItems = items.filter(
    (item) =>
      item.date >= dateKey(rangeStart) && item.date <= dateKey(rangeEnd),
  );
  const scheduledIncome = monthItems
    .filter((item) => item.type === "income" && item.scheduled)
    .reduce((total, item) => total + (item.amountMinor ?? 0), 0);
  const scheduledExpense = monthItems
    .filter((item) => item.type === "expense" && item.scheduled)
    .reduce((total, item) => total + (item.amountMinor ?? 0), 0);

  function moveMonth(offset: number) {
    const next = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + offset,
      1,
    );
    setVisibleMonth(next);
    setSelectedDate(dateKey(next));
  }

  function returnToToday() {
    setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(dateKey(now));
  }

  return (
    <section className="home-calendar" aria-labelledby="home-calendar-title">
      <div className="calendar-toolbar">
        <div>
          <p className="eyebrow">Planejamento mensal</p>
          <h2 id="home-calendar-title">{monthLabel.format(visibleMonth)}</h2>
        </div>
        <div className="calendar-navigation" aria-label="Navegar entre meses">
          <button
            type="button"
            onClick={() => moveMonth(-1)}
            aria-label="Mês anterior"
          >
            ←
          </button>
          <button type="button" onClick={returnToToday}>
            Hoje
          </button>
          <button
            type="button"
            onClick={() => moveMonth(1)}
            aria-label="Próximo mês"
          >
            →
          </button>
        </div>
      </div>
      <div className="calendar-summary" aria-label="Resumo do mês">
        <span>
          <strong>
            {monthItems.filter((item) => item.type === "task").length}
          </strong>{" "}
          tarefas com prazo
        </span>
        <span>
          <strong>
            {monthItems.filter((item) => item.type === "event").length}
          </strong>{" "}
          compromissos
        </span>
        <span className="income">
          <strong>{money.format(scheduledIncome / 100)}</strong> entradas
          previstas
        </span>
        <span className="expense">
          <strong>{money.format(scheduledExpense / 100)}</strong> saídas
          previstas
        </span>
      </div>
      {failed && (
        <p className="notice error" role="alert">
          Não foi possível carregar o planejamento mensal.
        </p>
      )}
      <div className="calendar-layout" aria-busy={loading}>
        <div className="month-calendar">
          <div className="calendar-weekdays" aria-hidden="true">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {cells.map((date) => {
              const key = dateKey(date);
              const dayItems = items.filter((item) => item.date === key);
              const outside = date.getMonth() !== visibleMonth.getMonth();
              return (
                <button
                  type="button"
                  className={`calendar-day${outside ? " outside" : ""}${key === selectedDate ? " selected" : ""}${key === dateKey(now) ? " today" : ""}`}
                  key={key}
                  onClick={() => {
                    setSelectedDate(key);
                    if (outside)
                      setVisibleMonth(
                        new Date(date.getFullYear(), date.getMonth(), 1),
                      );
                  }}
                  aria-label={`${date.toLocaleDateString("pt-BR")}, ${dayItems.length} item(ns)`}
                >
                  <span className="day-number">{date.getDate()}</span>
                  <span className="day-markers" aria-hidden="true">
                    {Array.from(new Set(dayItems.map((item) => item.type)))
                      .slice(0, 4)
                      .map((type) => (
                        <i className={type} key={type} />
                      ))}
                  </span>
                  {dayItems.slice(0, 2).map((item) => (
                    <small className={item.type} key={item.id}>
                      {item.title}
                    </small>
                  ))}
                </button>
              );
            })}
          </div>
        </div>
        <aside className="day-agenda" aria-label="Itens do dia selecionado">
          <p>
            {parseDateOnly(selectedDate).toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <h3>
            {selectedItems.length
              ? `${selectedItems.length} item(ns)`
              : "Dia livre"}
          </h3>
          {selectedItems.length === 0 ? (
            <span>Nenhuma tarefa, compromisso ou movimentação prevista.</span>
          ) : (
            <ul>
              {selectedItems.map((item) => (
                <li className={item.type} key={`${item.type}-${item.id}`}>
                  <i aria-hidden="true" />
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {item.detail}
                      {item.amountMinor !== undefined
                        ? ` · ${money.format(item.amountMinor / 100)}`
                        : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
      <div className="calendar-legend" aria-label="Legenda">
        <span className="task">Tarefas</span>
        <span className="event">Compromissos</span>
        <span className="income">Entradas</span>
        <span className="expense">Saídas</span>
      </div>
    </section>
  );
}
