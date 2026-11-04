import { TaskIcon } from "./TaskIcon.js";
import { useContentMotion } from "./use-content-motion.js";
import { DialogCloseButton, TaskCardDialog } from "./TaskCardDialog.js";
import { TaskTagFields } from "./TaskTagFields.js";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GOOGLE_PROJECTIONS_CHANGED_EVENT } from "../lib/google-calendar.js";
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
  onOpenTask,
  canOpenTask,
}: {
  onOpenTask?: (task: Task) => void;
  canOpenTask?: (task: Task) => boolean;
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [sourceSearch, setSourceSearch] = useState("");
  const [externalCard, setExternalCard] = useState<
    (ViewItem & { generation: string }) | null
  >(null);
  const [reading, setReading] = useState<GoogleReading | null>(null);
  const [readError, setReadError] = useState(false);
  const [readingInvalidated, setReadingInvalidated] = useState(false);
  const readEpoch = useRef(0);
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
  const contentRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const dayRef = useRef<HTMLElement>(null);
  useContentMotion(contentRef, view);
  useContentMotion(calendarRef, month, "horizontal");
  useContentMotion(dayRef, day);
  const [externalEditor, setExternalEditor] = useState<
    (ViewItem & { generation: string }) | null
  >(null);
  const [externalBusy, setExternalBusy] = useState(false);
  const [externalNotice, setExternalNotice] = useState("");
  const tagAttempt = useRef<ExternalTagsCommand | null>(null);
  useEffect(() => {
    const invalidate = () => {
      readEpoch.current++;
      readCursor.current = undefined;
      readAttempt.current = null;
      setReading(null);
      setExternalCard(null);
      setExternalEditor(null);
      setReadingInvalidated(true);
      setLoading(false);
    };
    window.addEventListener(GOOGLE_PROJECTIONS_CHANGED_EVENT, invalidate);
    return () =>
      window.removeEventListener(GOOGLE_PROJECTIONS_CHANGED_EVENT, invalidate);
  }, []);
  useEffect(() => {
    let active = true;
    const epoch = readEpoch.current;
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
        if (active && epoch === readEpoch.current) {
          setReadingInvalidated(false);
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
        if (active && epoch === readEpoch.current) {
          setReading(null);
          setReadError(true);
        }
      })
      .finally(() => {
        if (active && epoch === readEpoch.current) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [gateway, month, readSequence]);
  useEffect(() => {
    if (externalEditor && reading?.generation !== externalEditor.generation)
      setExternalEditor(null);
    if (externalCard && reading?.generation !== externalCard.generation)
      setExternalCard(null);
  }, [reading, externalEditor, externalCard]);
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
  const visibleItems =
    view === "kanban"
      ? selected.filter((i) => i.status !== "event")
      : selected.filter((i) => cells.some((date) => itemOnDay(i, date)));
  const visibleCount = visibleItems.length;
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.search)
    chips.push({
      key: "search",
      label: `Busca: ${filters.search}`,
      clear: () => patch({ search: "" }),
    });
  if (filters.due !== "all")
    chips.push({
      key: "due",
      label: (
        {
          today: "Hoje",
          week: "Próximos 7 dias",
          overdue: "Atrasadas (Gabio)",
          none: "Sem data",
          range: `${filters.from || "Início"} – ${filters.to || "Fim"}`,
        } as Record<string, string>
      )[filters.due]!,
      clear: () => patch({ due: "all", from: "", to: "" }),
    });
  if (filters.assignee !== "all")
    chips.push({
      key: "assignee",
      label: `Responsável: ${filters.assignee === "none" ? "Sem responsável" : filters.assignee === userId ? "Eu" : household.members.find((m) => m.userId === filters.assignee)?.displayName || "Selecionado"} (Gabio)`,
      clear: () => patch({ assignee: "all" }),
    });
  if (filters.visibility !== "all")
    chips.push({
      key: "visibility",
      label: filters.visibility === "private" ? "Somente eu" : "Da casa",
      clear: () => patch({ visibility: "all" }),
    });
  if (filters.recurrence !== "all")
    chips.push({
      key: "recurrence",
      label:
        filters.recurrence === "yes"
          ? "Recorrentes (Gabio)"
          : "Sem repetição (Gabio)",
      clear: () => patch({ recurrence: "all" }),
    });
  if (filters.statuses.length)
    chips.push({
      key: "status",
      label: `Status: ${filters.statuses.map((s) => ({ open: "A fazer", in_progress: "Em andamento", completed: "Concluídas", event: "Compromissos" })[s]).join(", ")}`,
      clear: () => patch({ statuses: [] }),
    });
  if (filters.tagMode === "none")
    chips.push({
      key: "no-tags",
      label: "Sem tags",
      clear: () => patch({ tagMode: "any" }),
    });
  filters.tags.forEach((t) =>
    chips.push({
      key: `tag:${t}`,
      label: `Tag: ${t}`,
      clear: () => toggle("tags", t),
    }),
  );
  if (filters.sources.length !== 3)
    chips.push({
      key: "sources",
      label: `Origens: ${filters.sources.map((s) => ({ gabio: "Gabio", google_tasks: "Google Tasks", google_calendar: "Google Agenda" })[s]).join(", ") || "Nenhuma"}`,
      clear: () => patch({ sources: [...initialTaskFilters.sources] }),
    });
  filters.sourceIds.forEach((id) =>
    chips.push({
      key: id,
      label: `Lista: ${reading?.sources.find((s) => `${s.source}:${s.id}` === id)?.name || "Selecionada"}`,
      clear: () => toggle("sourceIds", id),
    }),
  );
  function renderItem(item: ViewItem, detail = false) {
    if (item.task) return renderTask(item.task);
    const e = item.external!;
    return (
      <article className="task-card external-task" key={item.id}>
        <div className="task-card-heading">
          {detail ? (
            <strong>{item.title || "Sem título"}</strong>
          ) : (
            <button
              type="button"
              className="task-card-title"
              aria-label={`Abrir cartão: ${item.title || "Sem título"}`}
              onClick={() => {
                if (reading?.generation)
                  setExternalCard({ ...item, generation: reading.generation });
              }}
            >
              {item.title || "Sem título"}
            </button>
          )}
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
              if (reading?.generation) {
                setExternalCard(null);
                setExternalEditor({ ...item, generation: reading.generation });
              }
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
            aria-label="Kanban"
            title="Kanban"
            aria-pressed={view === "kanban"}
            onClick={() => setView("kanban")}
          >
            <TaskIcon name="board" />
            <span className="task-view-name">Kanban</span>
          </button>
          <button
            type="button"
            aria-label="Calendário"
            title="Calendário"
            aria-pressed={view === "calendar"}
            onClick={() => setView("calendar")}
          >
            <TaskIcon name="calendar" />
            <span className="task-view-name">Calendário</span>
          </button>
        </div>
        <div
          className="task-toolbar-actions"
          role="group"
          aria-label="Ferramentas de tarefas"
        >
          <button
            type="button"
            className="task-icon-button"
            aria-label="Buscar tarefas e eventos"
            title="Buscar tarefas e eventos"
            aria-haspopup="dialog"
            onClick={() => setSearchOpen(true)}
          >
            <TaskIcon name="search" />
            {filters.search && (
              <span className="task-tool-dot" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="task-icon-button"
            aria-label={`Filtros${activeFilterCount ? ` (${activeFilterCount})` : ""}`}
            title="Filtros"
            aria-haspopup="dialog"
            onClick={() => setFiltersOpen(true)}
          >
            <TaskIcon name="filter" />
            {activeFilterCount > 0 && (
              <span className="task-tool-badge" aria-hidden="true">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className="task-icon-button"
            aria-label="Ordenar tarefas"
            title="Ordenar tarefas"
            aria-haspopup="dialog"
            onClick={() => setSortOpen(true)}
          >
            <TaskIcon name="sort" />
          </button>
          <button
            type="button"
            className="task-icon-button"
            aria-label="Mais ações"
            title="Mais ações"
            aria-haspopup="dialog"
            onClick={() => setMoreOpen(true)}
          >
            <TaskIcon name="more" />
          </button>
        </div>
        <TaskCardDialog
          open={searchOpen}
          title="Buscar tarefas e eventos"
          onClose={() => setSearchOpen(false)}
        >
          <form
            className="task-dialog-form"
            onSubmit={(e) => {
              e.preventDefault();
              setSearchOpen(false);
            }}
          >
            <div className="task-dialog-fields">
              <label>
                Buscar por título
                <input
                  type="search"
                  name="search"
                  value={filters.search}
                  onChange={(e) => patch({ search: e.target.value })}
                  placeholder="Digite um título"
                />
              </label>
            </div>
            <footer className="task-dialog-actions">
              <button type="button" onClick={() => patch({ search: "" })}>
                Limpar busca
              </button>
              <button className="primary-button">Mostrar resultados</button>
            </footer>
          </form>
        </TaskCardDialog>
        <TaskCardDialog
          open={filtersOpen}
          title="Filtrar tarefas e eventos"
          onClose={() => setFiltersOpen(false)}
          className="task-filter-dialog"
        >
          <div className="task-dialog-fields task-filter-grid">
            {chips.length > 0 && (
              <div className="task-active-filters" aria-label="Filtros ativos">
                {chips.map((c) => (
                  <button
                    type="button"
                    key={c.key}
                    aria-label={`Remover filtro ${c.label}`}
                    onClick={c.clear}
                  >
                    {c.label}
                    <span aria-hidden="true"> ×</span>
                  </button>
                ))}
              </div>
            )}
            {filters.tags.length > 1 && (
              <small>
                Tags:{" "}
                {filters.tagMode === "all"
                  ? "todas as selecionadas"
                  : "qualquer uma das selecionadas"}
                .
              </small>
            )}

            <div
              className="task-presets"
              role="group"
              aria-label="Filtros rápidos"
            >
              {[
                ["today", "Hoje"],
                ["overdue", "Atrasadas (Gabio)"],
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
                aria-pressed={filters.assignee === userId}
                onClick={() =>
                  patch({
                    assignee: filters.assignee === userId ? "all" : userId,
                  })
                }
              >
                Minhas (Gabio)
              </button>
            </div>

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
                      tags: e.target.value === "none" ? [] : filters.tags,
                    })
                  }
                >
                  <option value="any">Qualquer uma</option>
                  <option value="all">Todas as selecionadas</option>
                  <option value="none">Sem tags</option>
                </select>
              </label>
              {filters.tagMode !== "none" && (
                <label>
                  Buscar tag
                  <input
                    type="search"
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                  />
                </label>
              )}
              {filters.tagMode !== "none" &&
                availableTags
                  .filter((t) =>
                    t
                      .toLocaleLowerCase("pt-BR")
                      .includes(tagSearch.toLocaleLowerCase("pt-BR")),
                  )
                  .map((t) => (
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
              {!!reading?.sources.length && (
                <label>
                  Buscar lista ou calendário
                  <input
                    type="search"
                    value={sourceSearch}
                    onChange={(e) => setSourceSearch(e.target.value)}
                  />
                </label>
              )}
              {reading?.sources
                .filter((s) =>
                  s.name
                    .toLocaleLowerCase("pt-BR")
                    .includes(sourceSearch.toLocaleLowerCase("pt-BR")),
                )
                .map((s) => (
                  <label className="task-check" key={`${s.source}:${s.id}`}>
                    <input
                      type="checkbox"
                      checked={filters.sourceIds.includes(
                        `${s.source}:${s.id}`,
                      )}
                      onChange={() =>
                        toggle("sourceIds", `${s.source}:${s.id}`)
                      }
                    />
                    {s.name} ·{" "}
                    {s.source === "google_tasks" ? "Tasks" : "Agenda"}
                  </label>
                ))}
              {!!reading?.sources.length && (
                <small>
                  Nenhuma lista/calendário selecionado: exibir todos.
                </small>
              )}
            </fieldset>
          </div>
          <footer className="task-dialog-actions">
            <button
              type="button"
              onClick={() =>
                setFilters({ ...initialTaskFilters, sort: filters.sort })
              }
            >
              Limpar filtros
            </button>
            <DialogCloseButton className="primary-button">
              Mostrar {visibleCount} resultado(s)
            </DialogCloseButton>
          </footer>
        </TaskCardDialog>
        <TaskCardDialog
          open={sortOpen}
          title="Ordenar tarefas"
          onClose={() => setSortOpen(false)}
        >
          <div className="task-dialog-fields">
            {" "}
            <label className="task-sort">
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
            <small>
              {view === "kanban"
                ? filters.sort === "due_asc"
                  ? "A fazer e Em andamento seguem o prazo mais próximo. Concluídas mostra primeiro as finalizadas mais recentemente."
                  : "A ordem é aplicada dentro de cada coluna."
                : "A ordem é aplicada à lista do dia, sem mudar as datas da grade."}
            </small>
            <DialogCloseButton>Concluído</DialogCloseButton>
          </div>
        </TaskCardDialog>
        <div className="task-results">
          <span role="status">
            {loading && (
              <span className="sr-only">Atualizando itens do Google. </span>
            )}
            {[
              view === "calendar"
                ? `${visibleItems.filter((i) => i.status === "event").length} compromisso(s) na grade`
                : "",
              activeFilterCount ? "Filtros ativos" : "",
              reading &&
              (reading.tasksState === "partial" ||
                reading.calendarState === "partial")
                ? "Contagem parcial"
                : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      </div>
      {externalCard && (
        <TaskCardDialog
          open
          title="Cartão do Google"
          onClose={() => setExternalCard(null)}
        >
          <div className="task-dialog-fields">
            <p>
              Somente leitura · Alterações no conteúdo são feitas no Google.
            </p>
            {renderItem(externalCard, true)}
          </div>
        </TaskCardDialog>
      )}
      {gateway.readGoogleItems &&
        (readingInvalidated ||
          readError ||
          (reading &&
            reading.state !== "disabled" &&
            (reading.state !== "connected" ||
              reading.tasksState !== "ok" ||
              reading.calendarState !== "ok"))) && (
          <div role="status">
            <button
              type="button"
              className="task-sync-notice"
              onClick={() => setMoreOpen(true)}
            >
              <TaskIcon name="warning" />
              {readingInvalidated
                ? "Atualizar leitura Google"
                : reading?.state === "consent_required"
                  ? "Autorizar leitura Google"
                  : "Google precisa de atenção"}
              <span className="sr-only">. Abrir detalhes da leitura</span>
            </button>
          </div>
        )}
      <TaskCardDialog
        open={moreOpen}
        title="Mais ações"
        onClose={() => setMoreOpen(false)}
      >
        <div className="task-dialog-fields task-more-actions">
          {gateway.executeTagCommand && (
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                setTagsOpen(true);
              }}
            >
              Gerenciar tags
            </button>
          )}
          {gateway.readGoogleItems && (
            <section
              className="task-google-state"
              aria-label="Leitura do Google"
            >
              {loading && <p role="status">Atualizando itens do Google…</p>}
              {readingInvalidated && (
                <p role="status">
                  A sincronização mudou. Atualize a leitura para consultar os
                  itens externos novamente.
                </p>
              )}
              {readError ? (
                <p role="alert">
                  Não foi possível consultar o Google. Suas tarefas Gabio
                  continuam disponíveis.
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
        </div>
      </TaskCardDialog>
      {externalEditor && (
        <TaskCardDialog
          open
          title="Editar tags locais"
          busy={externalBusy}
          onClose={() => setExternalEditor(null)}
        >
          <div className="task-dialog-fields external-tag-editor">
            <h3>{externalEditor.title}</h3>
            <p>
              Estas tags ficam somente no Gabio e serão removidas ao reconectar
              ou desconectar o Google.
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
              <TaskTagFields
                tags={externalEditor.tags}
                catalog={Array.from(
                  new Set(
                    (reading?.items ?? [])
                      .filter((i) => i.source === "google_tasks")
                      .flatMap((i) => i.tags),
                  ),
                ).map((name) => ({
                  id: name,
                  name,
                  visibility: "private",
                  version: 1,
                }))}
                visibility="private"
                disabled={externalBusy}
              />
              {externalNotice && <p role="alert">{externalNotice}</p>}
              <button disabled={externalBusy}>Salvar tags locais</button>
              <DialogCloseButton disabled={externalBusy}>
                Cancelar
              </DialogCloseButton>
            </form>
          </div>
        </TaskCardDialog>
      )}
      <div ref={contentRef} className="task-view-content">
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
              if (status === "completed" && filters.sort === "due_asc") {
                const completionTime = (item: ViewItem) =>
                  item.task?.completedAt
                    ? Date.parse(item.task.completedAt)
                    : Number.NEGATIVE_INFINITY;
                items.sort((a, b) => {
                  const aTime = completionTime(a);
                  const bTime = completionTime(b);
                  return aTime === bTime ? 0 : aTime > bTime ? -1 : 1;
                });
              }
              return (
                <section
                  className={`task-column ${status}`}
                  key={status}
                  aria-label={title}
                >
                  <header className="task-column-header">
                    <h3>{title}</h3>
                    <span
                      aria-label={`${items.length} ${items.length === 1 ? "tarefa" : "tarefas"} em ${title}`}
                    >
                      {items.length}
                    </span>
                  </header>
                  <div className="task-column-cards">
                    {items.length ? (
                      items.map((item) => renderItem(item))
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
            <div className="calendar-legend" aria-label="Legenda do calendário">
              <span>○ Tarefa</span>
              <span>✓ Concluída</span>
              <span>▪ Compromisso</span>
              <span>Horário de Brasília</span>
            </div>
            <div className="task-calendar-layout">
              <div>
                <div className="calendar-weekdays" aria-hidden="true">
                  {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(
                    (d) => (
                      <span key={d}>{d}</span>
                    ),
                  )}
                </div>
                <div className="calendar-grid" ref={calendarRef}>
                  {cells.map((date) => {
                    const items = selected.filter((i) => itemOnDay(i, date));
                    return (
                      <div
                        className={`calendar-day${date.slice(0, 7) !== month ? " outside" : ""}${date === day ? " selected" : ""}`}
                        key={date}
                      >
                        <button
                          type="button"
                          className="calendar-day-select"
                          aria-pressed={date === day}
                          aria-current={
                            date === householdDate(new Date())
                              ? "date"
                              : undefined
                          }
                          aria-label={`${labelDate(date, { dateStyle: "full" })}, ${items.length} itens`}
                          onClick={() => {
                            setDay(date);
                            if (date.slice(0, 7) !== month)
                              setMonth(date.slice(0, 7));
                          }}
                        >
                          <span className="calendar-date-number">
                            {Number(date.slice(-2))}
                          </span>
                          <span className="task-day-count">
                            {items.length
                              ? `${items.length} ${items.length === 1 ? "item" : "itens"}`
                              : ""}
                          </span>
                        </button>
                        <div className="task-day-titles">
                          {items.slice(0, 2).map((item) => (
                            <button
                              type="button"
                              key={item.id}
                              className={`calendar-event ${item.source}`}
                              disabled={
                                !!item.task &&
                                canOpenTask?.(item.task) === false
                              }
                              onClick={() => {
                                if (item.task && onOpenTask)
                                  onOpenTask(item.task);
                                else if (item.external && reading?.generation)
                                  setExternalCard({
                                    ...item,
                                    generation: reading.generation,
                                  });
                                else setDay(date);
                              }}
                              title={item.title}
                            >
                              <span
                                aria-hidden="true"
                                className="calendar-event-mark"
                              >
                                {item.status === "event"
                                  ? "▪"
                                  : item.status === "completed"
                                    ? "✓"
                                    : "○"}
                              </span>
                              {item.startsAt && (
                                <time>
                                  {new Intl.DateTimeFormat("pt-BR", {
                                    timeZone: "America/Bahia",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }).format(new Date(item.startsAt))}{" "}
                                </time>
                              )}
                              {item.title}
                            </button>
                          ))}
                          {items.length > 2 && (
                            <button
                              type="button"
                              className="calendar-more"
                              onClick={() => setDay(date)}
                            >
                              +{items.length - 2} mais
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <section
                className="task-day-list"
                ref={dayRef}
                aria-label="Itens do dia selecionado"
              >
                <h3>
                  {labelDate(day, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </h3>
                <p className="task-day-total">
                  {dayItems.length} {dayItems.length === 1 ? "item" : "itens"}
                </p>
                {dayItems.length ? (
                  dayItems.map((item) => renderItem(item))
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
                noDate.map((item) => renderItem(item))
              ) : (
                <p>Nenhuma tarefa sem data corresponde à seleção.</p>
              )}
            </details>
          </section>
        )}
      </div>
      {gateway.executeTagCommand && (
        <TagManager
          open={tagsOpen}
          onClose={() => setTagsOpen(false)}
          catalog={catalog}
          gateway={gateway}
          onChanged={onTagsChanged}
        />
      )}
    </div>
  );
}
function TagManager({
  open,
  onClose,
  catalog,
  gateway,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  catalog: TagRecord[];
  gateway: AppGateway;
  onChanged: () => Promise<unknown>;
}) {
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const attempt = useRef<TagMutation | null>(null);
  const tag = catalog.find((t) => t.id === selected);
  return (
    <TaskCardDialog
      open={open}
      title="Gerenciar tags"
      onClose={onClose}
      busy={busy}
      className="tag-manager-dialog"
    >
      <div className="task-dialog-fields tag-manager">
        <p>
          Renomear atualiza a tag em todas as tarefas do mesmo escopo. Para
          criar uma tag, abra um cartão.
        </p>
        <label>
          Buscar tag
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="tag-catalog-list">
          {(["household", "private"] as const).map((scope) => (
            <section
              key={scope}
              aria-label={
                scope === "private" ? "Tags somente minhas" : "Tags da casa"
              }
            >
              <h3>{scope === "private" ? "Somente eu" : "Da casa"}</h3>
              {catalog
                .filter(
                  (t) =>
                    t.visibility === scope &&
                    t.name
                      .toLocaleLowerCase("pt-BR")
                      .includes(search.toLocaleLowerCase("pt-BR")),
                )
                .map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    disabled={busy}
                    aria-pressed={selected === t.id}
                    aria-label={`Editar tag ${t.name} · ${scope === "private" ? "Somente eu" : "Da casa"}`}
                    onClick={() => {
                      setSelected(t.id);
                      setDeleting(false);
                      setNotice("");
                    }}
                  >
                    {t.name}
                    <span aria-hidden="true">Editar →</span>
                  </button>
                ))}
              {!catalog.some(
                (t) =>
                  t.visibility === scope &&
                  t.name
                    .toLocaleLowerCase("pt-BR")
                    .includes(search.toLocaleLowerCase("pt-BR")),
              ) && <p>Nenhuma tag encontrada neste escopo.</p>}
            </section>
          ))}
        </div>
        {tag && (
          <form
            key={`${tag.id}:${tag.version}`}
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              const data = new FormData(e.currentTarget);

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
            <h3>
              {tag.name} ·{" "}
              {tag.visibility === "private" ? "Somente eu" : "Da casa"}
            </h3>
            <label>
              Novo nome
              <input
                name="name"
                defaultValue={tag.name}
                minLength={1}
                maxLength={32}
                required={!deleting}
                disabled={busy || deleting}
              />
            </label>
            <div className="tag-manager-actions">
              {!deleting ? (
                <>
                  <button type="submit" disabled={busy}>
                    Salvar nome
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={busy}
                    onClick={() => setDeleting(true)}
                  >
                    Excluir tag
                  </button>
                </>
              ) : (
                <div role="alert">
                  <p>
                    Excluir “{tag.name}” de todas as tarefas{" "}
                    {tag.visibility === "private"
                      ? "privadas deste catálogo"
                      : "da casa"}
                    ? As tarefas serão mantidas.
                  </p>
                  <button type="submit" disabled={busy}>
                    Confirmar exclusão da tag
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDeleting(false)}
                  >
                    Manter tag
                  </button>
                </div>
              )}
            </div>
          </form>
        )}
        {notice && <p role="status">{notice}</p>}
      </div>
    </TaskCardDialog>
  );
}
