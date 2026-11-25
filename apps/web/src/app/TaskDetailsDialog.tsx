import { useCallback, useState, type ReactNode, type FormEvent } from "react";
import type { taskUpdateCommandSchema, Task } from "@gabio/contracts";
import { DialogCloseButton, TaskCardDialog } from "./TaskCardDialog.js";
import { TaskEditorDialog } from "./TaskEditorDialog.js";
import { TaskKindFields } from "./TaskKindFields.js";
import {
  TaskRecurrenceFields,
  taskRecurrenceLabel,
} from "./TaskRecurrenceFields.js";
import { TaskTagFields, parseTagInput } from "./TaskTagFields.js";
import { TaskCardContentPanel } from "./TaskCardContent.js";
import type { AppGateway, HouseholdContext } from "../lib/app-gateway.js";
import type { TagRecord } from "../lib/task-views.js";
import type { CardCommandQueue } from "../lib/task-card-queue.js";
import "../task-details.css";

type Changes = Omit<
  ReturnType<typeof taskUpdateCommandSchema.parse>["payload"],
  "taskId" | "expectedVersion"
>;
type Section = "title" | "schedule" | "assignee" | "tags" | "more";
const editorTitles: Record<Section, string> = {
  title: "Editar título",
  schedule: "Agendamento",
  assignee: "Editar responsável",
  tags: "Editar tags",
  more: "Visibilidade do cartão",
};

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
  const [snapshot, setSnapshot] = useState(task);
  const [propertyDirty, setPropertyDirty] = useState(false);
  const [contentDirty, setContentDirty] = useState(false);
  const [visibility, setVisibility] = useState(task.visibility);
  const [error, setError] = useState("");
  const [shareChanges, setShareChanges] = useState<Changes | null>(null);
  const readOnly = !["open", "in_progress"].includes(task.status);
  const disabled = busy || pending || readOnly;
  const setDirty = useCallback((value: boolean) => setContentDirty(value), []);
  const closeEditor = () => {
    setSection(null);
    setError("");
    setShareChanges(null);
    setPropertyDirty(false);
  };
  async function save(changes: Changes) {
    if (disabled || contentPending) return;
    if (await onUpdate(changes, snapshot.version)) closeEditor();
  }
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
      const parse = (v: string) =>
        v ? new Date(v + ":00-03:00").toISOString() : null;
      try {
        changes.dueAt = parse(String(form.get("dueAt") ?? ""));
        changes.kind = form.get("kind") as "task" | "event";
        changes.eventEndsAt =
          changes.kind === "event"
            ? parse(String(form.get("eventEndsAt") ?? ""))
            : null;
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
      changes.visibility = visibility;
      if (visibility !== snapshot.visibility) changes.tags = [];
      if (
        visibility !== snapshot.visibility &&
        snapshot.visibility === "private"
      ) {
        setShareChanges(changes);
        return;
      }
    }
    await save(changes);
  }
  function open(next: Section) {
    setSnapshot(task);
    setVisibility(task.visibility);
    setError("");
    setPropertyDirty(false);
    setShareChanges(null);
    setSection(next);
  }
  const summary = (which: Section, label: string, value: string) => (
    <button
      type="button"
      className="card-property"
      aria-haspopup="dialog"
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
    <>
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
        canClose={() => !section && !contentDirty}
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
              aria-label="Editar título"
              aria-haspopup="dialog"
              disabled={
                disabled || contentPending || contentDirty || section !== null
              }
              onClick={() => open("title")}
            >
              {task.title}
            </button>
            {pending && (
              <p role="status">
                Aguardando sincronização. As ações ficarão disponíveis após a
                confirmação.
              </p>
            )}
            {!section && feedback}
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
            </aside>
            <div className="card-detail-body">
              <TaskCardContentPanel
                queue={cardQueue}
                taskId={task.id}
                userId={userId}
                householdId={household.id}
                readOnly={disabled}
                blocked={section !== null}
                gateway={gateway}
                onChanged={onChanged}
                onDirtyChange={setDirty}
              />
            </div>
          </div>
        </div>
      </TaskCardDialog>
      {section && (
        <TaskEditorDialog
          title={shareChanges ? "Compartilhar cartão?" : editorTitles[section]}
          busy={busy}
          dirty={propertyDirty}
          onClose={closeEditor}
        >
          {feedback}
          {error && <p role="alert">{error}</p>}
          {shareChanges ? (
            <section aria-label="Confirmar compartilhamento">
              <p>
                Observações e checklists deste cartão também ficarão visíveis
                para todos da casa. As tags atuais serão removidas.
              </p>
              <div className="card-editor-actions">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setShareChanges(null)}
                >
                  Voltar
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={disabled}
                  onClick={() => void save(shareChanges)}
                >
                  Compartilhar cartão
                </button>
              </div>
            </section>
          ) : (
            <form
              className="card-property-editor"
              onSubmit={(e) => void submit(e)}
              onChangeCapture={() => setPropertyDirty(true)}
              key={section}
            >
              <fieldset disabled={disabled || contentPending}>
                {section === "title" && (
                  <label>
                    Título
                    <input
                      name="title"
                      required
                      maxLength={240}
                      defaultValue={snapshot.title}
                      autoFocus
                    />
                  </label>
                )}
                {section === "schedule" && (
                  <>
                    <TaskKindFields task={snapshot} />
                    <TaskRecurrenceFields task={snapshot} />
                  </>
                )}
                {section === "assignee" && (
                  <label>
                    Responsável
                    <select
                      name="assigneeUserId"
                      defaultValue={snapshot.assigneeUserId ?? ""}
                      autoFocus
                    >
                      <option value="">Sem responsável</option>
                      {household.members
                        .filter(
                          (m) =>
                            snapshot.visibility !== "private" ||
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
                    onSelectionChange={() => setPropertyDirty(true)}
                    tags={snapshot.tags ?? []}
                    visibility={snapshot.visibility}
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
                        autoFocus
                      >
                        <option value="household">Todos da casa</option>
                        <option
                          value="private"
                          disabled={snapshot.ownerUserId !== userId}
                        >
                          Somente eu
                        </option>
                      </select>
                    </label>
                    {visibility !== snapshot.visibility && (
                      <p>
                        Observações e checklists acompanham a visibilidade do
                        cartão. As tags serão removidas; você poderá selecionar
                        tags do novo escopo depois de salvar.
                      </p>
                    )}
                  </>
                )}
                <div className="card-editor-actions">
                  <DialogCloseButton disabled={busy}>
                    Cancelar
                  </DialogCloseButton>
                  <button className="primary-button">Salvar</button>
                </div>
              </fieldset>
            </form>
          )}
        </TaskEditorDialog>
      )}
    </>
  );
}
