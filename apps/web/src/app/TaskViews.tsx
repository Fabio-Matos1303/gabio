import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Task } from "@gabio/contracts";
import type { AppGateway, HouseholdContext } from "../lib/app-gateway.js";
import {
  googleReadingSchema,
  householdDate,
  initialTaskFilters,
  itemOnDay,
  selectViewItems,
  viewItems,
  type ExternalTagsCommand,
  type GoogleReading,
  type TagMutation,
  type TagRecord,
  type TaskFilters,
  type ViewItem,
} from "../lib/task-views.js";
import { parseTagInput } from "./TaskTagFields.js";
import "../task-views.css";

export function TaskViews({
  tasks,
  renderTask,
  gateway,
  household,
  userId,
  catalog,
  onTagsChanged,
}: {
  tasks: Task[];
  renderTask: (task: Task) => ReactNode;
  gateway: AppGateway;
  household: HouseholdContext;
  userId: string;
  catalog: TagRecord[];
  onTagsChanged: () => Promise<unknown>;
}) {
  const [view, setView] = useState<"kanban" | "calendar">("kanban");
  const [filters, setFilters] = useState<TaskFilters>(initialTaskFilters);
  const [reading, setReading] = useState<GoogleReading | null>(null);
  const [readError, setReadError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [readSequence, setReadSequence] = useState(0);
  const readCursor = useRef<string | undefined>(undefined);
  const readAttempt = useRef<{
    key: string;
    gateway: AppGateway;
    promise: Promise<GoogleReading>;
  } | null>(null);

  const [month, setMonth] = useState(() =>
    householdDate(new Date()).slice(0, 7),
  );
  const readMonth = useRef(month);
  const [day, setDay] = useState(() => householdDate(new Date()));
  const [externalEditor, setExternalEditor] = useState<
    (ViewItem & { generation: string }) | null
  >(null);
  const [externalBusy, setExternalBusy] = useState(false);
  const [externalNotice, setExternalNotice] = useState("");
  const tagAttempt = useRef<ExternalTagsCommand | null>(null);
  useEffect(() => {
    let active = true;
    if (!gateway.readGoogleItems) return;
    setLoading(true);
    setReadError(false);
    const sameMonth = readMonth.current === month;
    const cursor = sameMonth ? readCursor.current : undefined;
    readMonth.current = month;
    readCursor.current = undefined;
    const key = month + ":" + readSequence;
    if (
      readAttempt.current?.key !== key ||
      readAttempt.current.gateway !== gateway
    )
      readAttempt.current = {
        key,
        gateway,
        promise: gateway.readGoogleItems(month, cursor),
      };
    readAttempt.current.promise
      .then((value) => {
        const parsed = googleReadingSchema.parse(value);
        if (active) {
          setReading((current) => {
            if (
              parsed.state === "rate_limited" &&
              current?.generation === parsed.generation
            )
              return {
                ...current,
                continuation: sameMonth ? current.continuation : null,
                state: "rate_limited",
              };
            if (cursor && current?.generation === parsed.generation)
              return {
                ...parsed,
                items: Array.from(
                  new Map(
                    [...current.items, ...parsed.items].map((i) => [i.id, i]),
                  ).values(),
                ),
                sources: Array.from(
                  new Map(
                    [...current.sources, ...parsed.sources].map((s) => [
                      s.source + ":" + s.id,
                      s,
                    ]),
                  ).values(),
                ),
              };
            return parsed;
          });
          setReadError(false);
        }
      })
      .catch(() => {
        if (active) {
          setReading(null);
          setReadError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [gateway, month, readSequence]);
  useEffect(() => {
    if (externalEditor && reading?.generation !== externalEditor.generation)
      setExternalEditor(null);
  }, [reading, externalEditor]);
  const patch = (change: Partial<TaskFilters>) =>
    setFilters((current) => ({ ...current, ...change }));
  const toggle = (
    key: "sources" | "statuses" | "tags" | "sourceIds",
    value: string,
  ) =>
    patch({
      [key]: filters[key].includes(value)
        ? filters[key].filter((v) => v !== value)
        : [...filters[key], value],
    });
  const allItems = useMemo(
    () => viewItems(tasks, reading?.items ?? []),
    [tasks, reading],
  );
  const selected = selectViewItems(allItems, filters);
  const availableTags = Array.from(
    new Set(
      allItems.filter((i) => i.status !== "event").flatMap((i) => i.tags),
    ),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(1 - offset + index);
    return date.toISOString().slice(0, 10);
  });
  const labelDate = (value: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pt-BR", {
      ...options,
      timeZone: "America/Bahia",
    }).format(new Date(`${value}T12:00:00-03:00`));
  const moveMonth = (step: number) => {
    const date = new Date(first);
    date.setUTCMonth(date.getUTCMonth() + step);
    const next = date.toISOString().slice(0, 7);
    setMonth(next);
    setDay(next + "-01");
  };
  const noDate = selected.filter((i) => !i.date);
  const dayItems = selected.filter((i) => itemOnDay(i, day));
  const activeFilterCount =
    Number(!!filters.search) +
    Number(filters.statuses.length > 0) +
    Number(filters.due !== "all") +
    Number(filters.assignee !== "all") +
    Number(filters.visibility !== "all") +
    Number(filters.recurrence !== "all") +
    Number(filters.tags.length > 0 || filters.tagMode === "none") +
    Number(filters.sources.length !== 3 || filters.sourceIds.length > 0);
  function renderItem(item: ViewItem) {
    if (item.task) return renderTask(item.task);
    const e = item.external!;
    return (
      <article className="task-card external-task" key={item.id}>
        <div className="task-card-heading">
          <strong>{item.title || "Sem título"}</strong>
          <span className="visibility-chip private">Somente eu</span>
        </div>
        <p>
          {item.source === "google_tasks" ? "Google Tasks" : "Google Agenda"} ·{" "}
          {e.sourceName}
        </p>
        <p>
          {item.status === "event"
            ? "Compromisso"
            : item.status === "completed"
              ? "Concluída"
              : "A fazer"}
          {item.source === "google_tasks" && item.date
            ? " · Data programada"
            : ""}
          {item.date
            ? ` · ${item.startsAt ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" }).format(new Date(item.startsAt)) : labelDate(item.date, { dateStyle: "short" })}`
            : " · Sem data"}
          {item.endsAt
            ? ` até ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" }).format(new Date(item.endsAt))}`
            : item.endDate
              ? ` · Até ${labelDate(new Date(Date.parse(item.endDate + "T12:00:00Z") - 86400000).toISOString().slice(0, 10), { dateStyle: "short" })} (dia inteiro)`
              : ""}
        </p>
        <div className="task-tags">
          {item.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        {e.url && (
          <a href={e.url} target="_blank" rel="noopener noreferrer">
            Abrir no Google
          </a>
        )}
        {item.source === "google_tasks" && gateway.saveExternalTaskTags && (
          <button
            type="button"
            onClick={() => {
              if (reading?.generation)
                setExternalEditor({ ...item, generation: reading.generation });
              setExternalNotice("");
              tagAttempt.current = null;
            }}
          >
            Editar tags locais
          </button>
        )}
      </article>
    );
  }
  return (
    <div className="task-views">
      <div className="task-view-toolbar glass-surface">
        <div
          className="task-view-switch"
          role="group"
          aria-label="Visualização de tarefas"
        >
          <button
            type="button"
            aria-pressed={view === "kanban"}
            onClick={() => setView("kanban")}
          >
            Kanban
          </button>
          <button
            type="button"
            aria-pressed={view === "calendar"}
            onClick={() => setView("calendar")}
          >
            Calendário
          </button>
        </div>
        <label>
          Buscar tarefas e eventos
          <input
            type="search"
            value={filters.search}
            onChange={(e) => patch({ search: e.target.value })}
            placeholder="Buscar por título"
          />
        </label>
        <div className="task-presets" role="group" aria-label="Filtros rápidos">
          {[
            ["today", "Hoje"],
            ["overdue", "Atrasadas"],
            ["week", "Próximos 7 dias"],
            ["none", "Sem prazo"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={filters.due === value}
              onClick={() =>
                patch({ due: filters.due === value ? "all" : value! })
              }
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={filters.assignee === "none"}
            onClick={() =>
              patch({ assignee: filters.assignee === "none" ? "all" : "none" })
            }
          >
            Sem responsável
          </button>
        </div>
        <details>
          <summary>
            Filtros{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </summary>
          <div className="task-filter-grid">
            <fieldset>
              <legend>Status</legend>
              {[
                ["open", "A fazer"],
                ["in_progress", "Em andamento"],
                ["completed", "Concluídas"],
                ["event", "Compromissos"],
              ].map(([value, label]) => (
                <label className="task-check" key={value}>
                  <input
                    type="checkbox"
                    checked={filters.statuses.includes(value!)}
                    onChange={() => toggle("statuses", value!)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <label>
              Período
              <select
                value={filters.due}
                onChange={(e) => patch({ due: e.target.value })}
              >
                <option value="all">Todos os períodos</option>
                <option value="today">Hoje</option>
                <option value="week">Próximos 7 dias</option>
                <option value="overdue">Atrasadas (Gabio)</option>
                <option value="none">Sem data ou prazo</option>
                <option value="range">Intervalo personalizado</option>
              </select>
            </label>
            {filters.due === "range" && (
              <>
                <label>
                  De
                  <input
                    type="date"
                    value={filters.from}
                    max={filters.to || undefined}
                    onChange={(e) => patch({ from: e.target.value })}
                  />
                </label>
                <label>
                  Até
                  <input
                    type="date"
                    value={filters.to}
                    min={filters.from || undefined}
                    onChange={(e) => patch({ to: e.target.value })}
                  />
                </label>
                {filters.from && filters.to && filters.from > filters.to && (
                  <p role="alert">
                    A data final deve ser igual ou posterior à inicial.
                  </p>
                )}
              </>
            )}
            <label>
              Responsável (Gabio)
              <select
                value={filters.assignee}
                onChange={(e) => patch({ assignee: e.target.value })}
              >
                <option value="all">Todos</option>
                <option value="none">Sem responsável</option>
                {household.members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.userId === userId ? "Eu" : m.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Visibilidade
              <select
                value={filters.visibility}
                onChange={(e) => patch({ visibility: e.target.value })}
              >
                <option value="all">Todas</option>
                <option value="household">Da casa</option>
                <option value="private">Somente eu</option>
              </select>
            </label>
            <label>
              Recorrência (Gabio)
              <select
                value={filters.recurrence}
                onChange={(e) => patch({ recurrence: e.target.value })}
              >
                <option value="all">Todas</option>
                <option value="yes">Recorrentes</option>
                <option value="no">Sem repetição</option>
              </select>
            </label>
            <fieldset>
              <legend>Tags de tarefas</legend>
              <label>
                Correspondência
                <select
                  value={filters.tagMode}
                  onChange={(e) =>
                    patch({
                      tagMode: e.target.value as TaskFilters["tagMode"],
                      tags: [],
                    })
                  }
                >
                  <option value="any">Qualquer uma</option>
                  <option value="all">Todas as selecionadas</option>
                  <option value="none">Sem tags</option>
                </select>
              </label>
              {filters.tagMode !== "none" &&
                availableTags.map((t) => (
                  <label className="task-check" key={t}>
                    <input
                      type="checkbox"
                      checked={filters.tags.includes(t)}
                      onChange={() => toggle("tags", t)}
                    />
                    {t}
                  </label>
                ))}
              <small>Filtros por tags exibem somente tarefas.</small>
            </fieldset>
            <fieldset>
              <legend>Origem</legend>
              {[
                ["gabio", "Gabio"],
                ["google_tasks", "Google Tasks"],
                ["google_calendar", "Google Agenda"],
              ].map(([value, label]) => (
                <label className="task-check" key={value}>
                  <input
                    type="checkbox"
                    checked={filters.sources.includes(value!)}
                    onChange={() => toggle("sources", value!)}
                  />
                  {label}
                </label>
              ))}
              {reading?.sources.map((s) => (
                <label className="task-check" key={`${s.source}:${s.id}`}>
                  <input
                    type="checkbox"
                    checked={filters.sourceIds.includes(`${s.source}:${s.id}`)}
                    onChange={() => toggle("sourceIds", `${s.source}:${s.id}`)}
                  />
                  {s.name} · {s.source === "google_tasks" ? "Tasks" : "Agenda"}
                </label>
              ))}
              {!!reading?.sources.length && (
                <small>
                  Nenhuma lista/calendário selecionado: exibir todos.
                </small>
              )}
            </fieldset>
          </div>
        </details>
        <label>
          Ordenar
          <select
            value={filters.sort}
            onChange={(e) => patch({ sort: e.target.value })}
          >
            {[
              ["created_desc", "Criação mais recente"],
              ["due_asc", "Prazo mais próximo"],
              ["due_desc", "Prazo mais distante"],
              ["updated_desc", "Atualização mais recente"],
              ["title", "Título A–Z"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <div className="task-results">
          <span role="status">
            {selected.filter((i) => i.status !== "event").length} tarefa(s)
            {view === "calendar"
              ? ` · ${selected.filter((i) => i.status === "event").length} compromisso(s)`
              : ""}
            {activeFilterCount ? " · Filtros ativos" : ""}
          </span>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => setFilters(initialTaskFilters)}
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>
      {gateway.readGoogleItems && (
        <section className="task-google-state" aria-label="Leitura do Google">
          {loading && <p role="status">Atualizando itens do Google…</p>}
          {readError ? (
            <p role="alert">
              Não foi possível consultar o Google. Suas tarefas Gabio continuam
              disponíveis.
            </p>
          ) : (
            reading && (
              <>
                <p>
                  {reading.state === "disabled"
                    ? "Leitura do Google em preparação."
                    : reading.state === "consent_required"
                      ? "Autorize a leitura de Google Tasks e Agenda em Ajustes."
                      : reading.state === "reconnect"
                        ? "Reconecte sua conta Google em Ajustes."
                        : reading.state === "rate_limited"
                          ? "Aguarde um minuto antes de atualizar o Google. Os itens exibidos são da última consulta e podem não cobrir o mês selecionado."
                          : `Google consultado às ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia", timeStyle: "short" }).format(new Date(reading.checkedAt))}.`}
                </p>
                {reading.tasksState !== "ok" && (
                  <p role="status">
                    Google Tasks:{" "}
                    {reading.tasksState === "partial"
                      ? "resultados parciais."
                      : "consulta indisponível."}
                  </p>
                )}
                {reading.calendarState !== "ok" && (
                  <p role="status">
                    Google Agenda:{" "}
                    {reading.calendarState === "partial"
                      ? "resultados parciais; limite de leitura atingido."
                      : "consulta indisponível."}
                  </p>
                )}
                {loading && (
                  <p>Aguarde a atualização para conferir os resultados.</p>
                )}
              </>
            )
          )}
          {reading?.continuation && (
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                readCursor.current = reading.continuation ?? undefined;
                setReadSequence((n) => n + 1);
              }}
            >
              Carregar mais itens Google
            </button>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => setReadSequence((n) => n + 1)}
          >
            Atualizar Google
          </button>
        </section>
      )}
      {externalEditor && (
        <section
          className="glass-surface external-tag-editor"
          aria-label="Editar tags locais"
        >
          <h3>Tags de {externalEditor.title}</h3>
          <p>
            Estas tags ficam somente no Gabio e serão removidas ao reconectar ou
            desconectar o Google.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                externalBusy ||
                !gateway.saveExternalTaskTags ||
                !reading?.generation ||
                externalEditor.generation !== reading.generation
              )
                return;
              const tags = parseTagInput(
                new FormData(e.currentTarget).get("tags"),
              );
              const candidate = {
                generation: externalEditor.generation,
                listId: externalEditor.sourceId,
                taskId: externalEditor.external!.remoteId,
                tags,
              };
              const previous = tagAttempt.current;
              const command =
                previous &&
                JSON.stringify({ ...previous, commandId: undefined }) ===
                  JSON.stringify(candidate)
                  ? previous
                  : { commandId: crypto.randomUUID(), ...candidate };
              tagAttempt.current = command;
              setExternalBusy(true);
              try {
                await gateway.saveExternalTaskTags(command);
                setReading((current) =>
                  current?.generation === command.generation
                    ? {
                        ...current,
                        items: current.items.map((i) =>
                          i.id === externalEditor.id
                            ? { ...i, tags: command.tags }
                            : i,
                        ),
                      }
                    : current,
                );
                setExternalEditor(null);
              } catch {
                setExternalNotice(
                  "Não foi possível salvar. Revise as tags e tente novamente.",
                );
              } finally {
                setExternalBusy(false);
              }
            }}
          >
            <label>
              Tags separadas por vírgulas
              <input
                name="tags"
                defaultValue={externalEditor.tags.join(", ")}
                disabled={externalBusy}
              />
            </label>
            {externalNotice && <p role="alert">{externalNotice}</p>}
            <button disabled={externalBusy}>Salvar tags locais</button>
            <button
              type="button"
              disabled={externalBusy}
              onClick={() => setExternalEditor(null)}
            >
              Cancelar
            </button>
          </form>
        </section>
      )}
      {view === "kanban" ? (
        <div
          className="task-board"
          role="region"
          aria-label="Quadro de tarefas"
        >
          {[
            ["open", "A fazer"],
            ["in_progress", "Em andamento"],
            ["completed", "Concluídas"],
          ].map(([status, title]) => {
            const items = selected.filter((i) => i.status === status);
            return (
              <section
                className={`task-column ${status}`}
                key={status}
                aria-label={title}
              >
                <header className="task-column-header">
                  <h3>{title}</h3>
                  <span>{items.length}</span>
                </header>
                <div className="task-column-cards">
                  {items.length ? (
                    items.map(renderItem)
                  ) : (
                    <p className="task-column-empty">
                      {activeFilterCount
                        ? "Nenhuma tarefa corresponde aos filtros."
                        : "Nenhuma tarefa aqui."}
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <section
          className="task-calendar glass-surface"
          aria-label="Calendário de tarefas"
        >
          <header className="calendar-toolbar">
            <h3>
              {labelDate(month + "-01", { month: "long", year: "numeric" })}
            </h3>
            <div className="calendar-navigation">
              <button
                type="button"
                aria-label="Mês anterior"
                onClick={() => moveMonth(-1)}
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => {
                  const today = householdDate(new Date());
                  setMonth(today.slice(0, 7));
                  setDay(today);
                }}
              >
                Hoje
              </button>
              <button
                type="button"
                aria-label="Próximo mês"
                onClick={() => moveMonth(1)}
              >
                →
              </button>
            </div>
          </header>
          <div className="task-calendar-layout">
            <div>
              <div className="calendar-weekdays" aria-hidden="true">
                {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="calendar-grid">
                {cells.map((date) => {
                  const items = selected.filter((i) => itemOnDay(i, date));
                  return (
                    <button
                      type="button"
                      className={`calendar-day${date.slice(0, 7) !== month ? " outside" : ""}${date === day ? " selected" : ""}`}
                      key={date}
                      aria-pressed={date === day}
                      aria-current={
                        date === householdDate(new Date()) ? "date" : undefined
                      }
                      aria-label={`${labelDate(date, { dateStyle: "full" })}, ${items.length} itens`}
                      onClick={() => {
                        setDay(date);
                        if (date.slice(0, 7) !== month)
                          setMonth(date.slice(0, 7));
                      }}
                    >
                      <span>{Number(date.slice(-2))}</span>
                      <span className="task-day-count">
                        {items.length
                          ? `${items.length} ${items.length === 1 ? "item" : "itens"}`
                          : ""}
                      </span>
                      <span className="task-day-titles">
                        {items.slice(0, 2).map((i) => (
                          <small key={i.id}>{i.title}</small>
                        ))}
                        {items.length > 2 && <small>+{items.length - 2}</small>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <section
              className="task-day-list"
              aria-label="Itens do dia selecionado"
            >
              <h3>
                {labelDate(day, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </h3>
              <p>{dayItems.length} item(ns)</p>
              {dayItems.length ? (
                dayItems.map(renderItem)
              ) : (
                <p>
                  Nenhum item{" "}
                  {activeFilterCount
                    ? "corresponde aos filtros neste dia."
                    : "neste dia."}
                </p>
              )}
            </section>
          </div>
          <details className="task-no-date">
            <summary>Sem data ou prazo ({noDate.length})</summary>
            {noDate.length ? (
              noDate.map(renderItem)
            ) : (
              <p>Nenhuma tarefa sem data corresponde à seleção.</p>
            )}
          </details>
        </section>
      )}
      {gateway.executeTagCommand && (
        <TagManager
          catalog={catalog}
          gateway={gateway}
          onChanged={onTagsChanged}
        />
      )}
    </div>
  );
}
function TagManager({
  catalog,
  gateway,
  onChanged,
}: {
  catalog: TagRecord[];
  gateway: AppGateway;
  onChanged: () => Promise<unknown>;
}) {
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const attempt = useRef<TagMutation | null>(null);
  const tag = catalog.find((t) => t.id === selected);
  return (
    <details className="tag-manager glass-surface">
      <summary>Gerenciar tags ({catalog.length})</summary>
      <label>
        Tag
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setNotice("");
          }}
          disabled={busy}
        >
          <option value="">Selecione uma tag</option>
          {catalog.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {t.visibility === "private" ? "Somente eu" : "Da casa"}
            </option>
          ))}
        </select>
      </label>
      {tag && (
        <form
          key={`${tag.id}:${tag.version}`}
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const data = new FormData(e.currentTarget);
            const deleting = data.get("delete") === "on";
            const candidate = {
              type: deleting ? ("delete" as const) : ("rename" as const),
              tagId: tag.id,
              expectedVersion: tag.version,
              ...(deleting ? {} : { name: String(data.get("name")) }),
            };
            const old = attempt.current;
            const command =
              old &&
              JSON.stringify({ ...old, commandId: undefined }) ===
                JSON.stringify(candidate)
                ? old
                : ({
                    commandId: crypto.randomUUID(),
                    ...candidate,
                  } as TagMutation);
            attempt.current = command;
            setBusy(true);
            try {
              await gateway.executeTagCommand!(command);
              await onChanged();
              setSelected("");
              setNotice("Tag atualizada.");
            } catch {
              setNotice(
                "Não foi possível atualizar. O nome pode já existir ou a tag ter mudado. Atualize as tarefas antes de tentar novamente.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Novo nome
            <input
              name="name"
              defaultValue={tag.name}
              minLength={1}
              maxLength={32}
              required
              disabled={busy}
            />
          </label>
          <label className="task-check">
            <input name="delete" type="checkbox" disabled={busy} />
            Confirmo excluir esta tag e removê-la de todas as tarefas desse
            escopo
          </label>
          <button disabled={busy}>Aplicar alteração</button>
        </form>
      )}
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}
