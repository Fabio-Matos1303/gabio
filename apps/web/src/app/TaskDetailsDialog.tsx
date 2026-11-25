import { useCallback, useState, type ReactNode, type FormEvent } from "react";
import type { taskUpdateCommandSchema, Task } from "@gabio/contracts";
import { TaskCardDialog } from "./TaskCardDialog.js";
import { TaskKindFields } from "./TaskKindFields.js";
import {
  TaskRecurrenceFields,
  taskRecurrenceLabel,
} from "./TaskRecurrenceFields.js";
import { TaskTagFields, parseTagInput } from "./TaskTagFields.js";
import { TaskCardContentPanel } from "./TaskCardContent.js";
import type { AppGateway, HouseholdContext } from "../lib/app-gateway.js";
import type { TagRecord } from "../lib/task-views.js";
import "../task-details.css";
import type { CardCommandQueue } from "../lib/task-card-queue.js";

type Changes = Omit<
  ReturnType<typeof taskUpdateCommandSchema.parse>["payload"],
  "taskId" | "expectedVersion"
>;
type Section = "title" | "schedule" | "assignee" | "tags" | "more";
export function TaskDetailsDialog({
  task,
  gateway,
  userId,
  household,
  catalog,
  busy,
  pending,
  contentPending,
  cardQueue,
  feedback,
  onClose,
  onUpdate,
  onChanged,
}: {
  task: Task;
  gateway: AppGateway;
  userId: string;
  household: HouseholdContext;
  catalog: TagRecord[];
  busy: boolean;
  pending: boolean;
  contentPending: boolean;
  cardQueue: CardCommandQueue;
  feedback: ReactNode;
  onClose: () => void;
  onUpdate: (changes: Changes, expectedVersion: number) => Promise<boolean>;
  onChanged: () => Promise<unknown>;
}) {
  const [section, setSection] = useState<Section | null>(null);
  const [editVersion, setEditVersion] = useState(task.version);
  const [contentDirty, setContentDirty] = useState(false);
  const [visibility, setVisibility] = useState(task.visibility);
  const [error, setError] = useState("");
  const readOnly = !["open", "in_progress"].includes(task.status);
  const disabled = busy || pending || readOnly;
  const setDirty = useCallback((value: boolean) => setContentDirty(value), []);
  const closeEditor = () => {
    if (window.confirm("Descartar as alterações deste editor?")) {
      setSection(null);
      setError("");
    }
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const changes: Changes = {};
    if (section === "title") changes.title = String(form.get("title") ?? "");
    if (section === "assignee")
      changes.assigneeUserId = String(form.get("assigneeUserId") ?? "") || null;
    if (section === "tags") changes.tags = parseTagInput(form.get("tags"));
    if (section === "schedule") {
      const due = String(form.get("dueAt") ?? "");
      const end = String(form.get("eventEndsAt") ?? "");
      const parse = (v: string) =>
        v ? new Date(v + ":00-03:00").toISOString() : null;
      try {
        changes.dueAt = parse(due);
        changes.kind = form.get("kind") as "task" | "event";
        changes.eventEndsAt = changes.kind === "event" ? parse(end) : null;
        changes.recurrence = String(
          form.get("recurrence"),
        ) as Task["recurrence"];
        changes.recurrenceRule = JSON.parse(
          String(form.get("recurrenceRule") || "null"),
        );
      } catch {
        setError("Revise as datas e a recorrência.");
        return;
      }
    }
    if (section === "more") {
      if (
        visibility !== task.visibility &&
        task.visibility === "private" &&
        !window.confirm(
          "Compartilhar também observações e checklists deste cartão com todos da casa?",
        )
      )
        return;
      changes.visibility = visibility;
      if (visibility !== task.visibility) changes.tags = [];
    }
    if (await onUpdate(changes, editVersion)) setSection(null);
  }
  function open(next: Section) {
    setEditVersion(task.version);
    setVisibility(task.visibility);
    setError("");
    setSection(next);
  }
  const summary = (which: Section, label: string, value: string) => (
    <button
      type="button"
      className="card-property"
      disabled={disabled || contentPending || contentDirty || section !== null}
      onClick={() => open(which)}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
  const date = task.dueAt
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Bahia",
      }).format(new Date(task.dueAt))
    : "Sem prazo";
  return (
    <TaskCardDialog
      open
      title={
        readOnly
          ? "Cartão da tarefa"
          : task.kind === "event"
            ? "Editar evento"
            : "Editar tarefa"
      }
      className="task-details-dialog"
      busy={busy}
      onClose={onClose}
      canClose={() =>
        !(section || contentDirty) ||
        window.confirm("Descartar o rascunho e fechar o cartão?")
      }
    >
      <div className="task-details-scroll">
        <div className="card-detail-header">
          <p>
            {task.kind === "event" ? "Evento" : "Tarefa"} ·{" "}
            {task.status === "completed"
              ? "Concluída · Consulta"
              : task.status === "in_progress"
                ? "Em andamento"
                : task.status === "cancelled"
                  ? "Cancelada · Consulta"
                  : "A fazer"}{" "}
            · {task.visibility === "private" ? "Somente eu" : "Da casa"}
          </p>
          <button
            type="button"
            className="card-detail-title"
            disabled={
              disabled || contentPending || contentDirty || section !== null
            }
            onClick={() => open("title")}
            aria-label="Editar título"
          >
            {task.title}
          </button>
          {pending && (
            <p role="status">
              Aguardando sincronização. As ações ficarão disponíveis após a
              confirmação.
            </p>
          )}
          {feedback}
        </div>
        <div className="task-details-layout">
          <aside
            className="card-properties"
            aria-label="Propriedades do cartão"
          >
            {summary(
              "schedule",
              task.kind === "event" ? "Início" : "Prazo",
              date,
            )}
            {task.kind === "event" && task.eventEndsAt && (
              <p>
                Fim:{" "}
                {new Intl.DateTimeFormat("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                  timeZone: "America/Bahia",
                }).format(new Date(task.eventEndsAt))}
              </p>
            )}
            {summary(
              "schedule",
              "Recorrência",
              taskRecurrenceLabel(task.recurrence, task.recurrenceRule) ||
                "Não repetir",
            )}
            {summary(
              "assignee",
              "Responsável",
              household.members.find((m) => m.userId === task.assigneeUserId)
                ?.displayName || "Sem responsável",
            )}
            {summary("tags", "Tags", task.tags?.join(", ") || "Sem tags")}
            {summary(
              "more",
              "Mais opções",
              task.visibility === "private" ? "Somente eu" : "Todos da casa",
            )}
            {section && (
              <form
                className="card-property-editor"
                onSubmit={(e) => void submit(e)}
                key={section}
              >
                <fieldset disabled={disabled || contentPending}>
                  <legend>
                    {
                      {
                        title: "Editar título",
                        schedule: "Agendamento",
                        assignee: "Responsável",
                        tags: "Tags",
                        more: "Quem pode ver",
                      }[section]
                    }
                  </legend>
                  {error && <p role="alert">{error}</p>}
                  {section === "title" && (
                    <label>
                      Título
                      <input
                        name="title"
                        required
                        maxLength={240}
                        defaultValue={task.title}
                        autoFocus
                      />
                    </label>
                  )}
                  {section === "schedule" && (
                    <>
                      <TaskKindFields task={task} />
                      <TaskRecurrenceFields task={task} />
                    </>
                  )}
                  {section === "assignee" && (
                    <label>
                      Responsável
                      <select
                        name="assigneeUserId"
                        defaultValue={task.assigneeUserId ?? ""}
                      >
                        <option value="">Sem responsável</option>
                        {household.members
                          .filter(
                            (m) =>
                              task.visibility !== "private" ||
                              m.userId === userId,
                          )
                          .map((m) => (
                            <option key={m.userId} value={m.userId}>
                              {m.displayName}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  {section === "tags" && (
                    <TaskTagFields
                      tags={task.tags ?? []}
                      visibility={task.visibility}
                      catalog={catalog}
                    />
                  )}
                  {section === "more" && (
                    <>
                      <label>
                        Quem pode ver
                        <select
                          name="visibility"
                          value={visibility}
                          onChange={(e) =>
                            setVisibility(e.target.value as typeof visibility)
                          }
                        >
                          <option value="household">Todos da casa</option>
                          <option
                            value="private"
                            disabled={task.ownerUserId !== userId}
                          >
                            Somente eu
                          </option>
                        </select>
                      </label>
                      {visibility !== task.visibility && (
                        <p>
                          Observações e checklists acompanham a visibilidade do
                          cartão. As tags serão removidas; você poderá
                          selecionar tags do novo escopo depois de salvar.
                        </p>
                      )}
                    </>
                  )}
                  <div className="card-editor-actions">
                    <button className="primary-button">Salvar alteração</button>
                    <button type="button" onClick={closeEditor}>
                      Cancelar edição
                    </button>
                  </div>
                </fieldset>
              </form>
            )}
          </aside>
          <div className="card-detail-body">
            <TaskCardContentPanel
              queue={cardQueue}
              taskId={task.id}
              userId={userId}
              householdId={household.id}
              readOnly={disabled || section !== null}
              gateway={gateway}
              onChanged={onChanged}
              onDirtyChange={setDirty}
            />
          </div>
        </div>
      </div>
    </TaskCardDialog>
  );
}
