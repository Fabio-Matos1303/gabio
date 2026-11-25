import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  taskCardContentSchema,
  taskCardCommandSchema,
  type TaskCardContent,
  type TaskCardCommand,
  type TaskChecklist,
  type ChecklistItem,
} from "@gabio/contracts";
import type { AppGateway } from "../lib/app-gateway.js";
import { GatewayError } from "../lib/app-gateway.js";
import { TaskEditorDialog } from "./TaskEditorDialog.js";
import { DialogCloseButton } from "./TaskCardDialog.js";
import {
  syncCardCommandQueue,
  type QueuedCardCommand,
  type CardCommandQueue,
} from "../lib/task-card-queue.js";

export function TaskCardContentPanel({
  taskId,
  userId,
  householdId,
  readOnly,
  blocked = false,
  gateway,
  onChanged,
  onDirtyChange,
  queue,
}: {
  taskId: string;
  userId: string;
  householdId: string;
  readOnly: boolean;
  blocked?: boolean;
  gateway: AppGateway;
  onChanged: () => Promise<unknown>;
  onDirtyChange: (dirty: boolean) => void;
  queue: CardCommandQueue;
}) {
  const [content, setContent] = useState<TaskCardContent | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<QueuedCardCommand[]>([]);
  const [notes, setNotes] = useState<string | null>(null);
  const [notesEditVersion, setNotesEditVersion] = useState(0);
  const [notesBaseline, setNotesBaseline] = useState("");
  const [editor, setEditor] = useState<TaskChecklist | null>(null);
  const [newList, setNewList] = useState(false);
  const [editorBaseline, setEditorBaseline] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const context = useMemo(
    () => ({ userId, householdId }),
    [userId, householdId],
  );
  const current = useRef(true);
  const lock = useRef(false);
  const dirty = notes !== null || editor !== null;
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  const load = useCallback(
    async (sync = false) => {
      if (
        lock.current ||
        !gateway.readTaskCard ||
        !gateway.executeTaskCardCommand
      )
        return;
      lock.current = true;
      setBusy(true);
      setError("");
      try {
        if (sync && navigator.onLine)
          await syncCardCommandQueue(
            queue,
            gateway,
            context,
            () => current.current,
          );
        if (!current.current) return;
        setEntries(
          (await queue.list(context)).filter(
            (e) => e.command.payload.taskId === taskId,
          ),
        );
        const result = taskCardContentSchema.parse(
          await gateway.readTaskCard(taskId),
        );
        if (result.taskId !== taskId) throw new Error("unexpected card");
        if (current.current) setContent(result);
      } catch (error) {
        if (current.current) {
          if (error instanceof GatewayError && error.kind === "conflict") {
            setContent(null);
            setNotes(null);
            setEditor(null);
          }
          setError(
            "Não foi possível carregar os detalhes. Verifique sua conexão e o acesso ao cartão.",
          );
        }
      } finally {
        lock.current = false;
        if (current.current) setBusy(false);
      }
    },
    [context, gateway, queue, taskId],
  );
  useEffect(() => {
    current.current = true;
    void load(true);
    const online = () => {
      void load(true).then(() => current.current && onChanged());
    };
    window.addEventListener("online", online);
    return () => {
      current.current = false;
      window.removeEventListener("online", online);
    };
  }, [load, onChanged]);
  async function send(value: TaskCardCommand) {
    if (lock.current || readOnly || blocked || entries.length) return;
    const parsed = taskCardCommandSchema.safeParse(value);
    if (!parsed.success) {
      setError(
        "Preencha o nome e os itens da checklist com texto válido, respeitando os limites.",
      );
      return;
    }
    const command = parsed.data;
    let confirmed = false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await queue.put(context, command);
      if (navigator.onLine)
        await syncCardCommandQueue(
          queue,
          gateway,
          context,
          () => current.current,
        );
      const remaining = (await queue.list(context)).filter(
        (e) => e.command.payload.taskId === taskId,
      );
      if (!current.current) return;
      setEntries(remaining);
      confirmed = remaining.length === 0;
      await onChanged();
      if (!remaining.some((e) => e.status === "conflict")) {
        setNotes(null);
        setEditor(null);
        setNewList(false);
      }
      const result = taskCardContentSchema.parse(
        await gateway.readTaskCard!(taskId),
      );
      if (current.current && result.taskId === taskId) setContent(result);
    } catch (error) {
      if (current.current) {
        if (error instanceof GatewayError && error.kind === "conflict") {
          setContent(null);
          setNotes(null);
          setEditor(null);
        }
        setError(
          confirmed
            ? "Alteração confirmada. Não foi possível atualizar os detalhes; tente sincronizar novamente."
            : "Não foi possível confirmar a alteração. Tente sincronizar; o mesmo comando será reenviado.",
        );
      }
    } finally {
      lock.current = false;
      if (current.current) setBusy(false);
    }
  }
  const disabled = busy || readOnly || blocked || entries.length > 0;
  const closeDraft = () => {
    setNotes(null);
    setEditor(null);
    setNewList(false);
    setDeleteConfirm(false);
    setError("");
  };
  const queueFeedback = (
    <>
      {(error || entries.length > 0) && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void load(true).then(() => current.current && onChanged())
          }
        >
          Sincronizar detalhes
        </button>
      )}
      {entries.map((entry) => (
        <div key={entry.command.commandId} role="status">
          <p>
            {entry.status === "conflict"
              ? "O cartão mudou. Seu rascunho foi preservado. Descarte a tentativa em conflito para revisar os dados atuais."
              : "Alteração guardada neste dispositivo. Aguardando confirmação do servidor."}
          </p>
          {entry.status === "conflict" && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                await queue.remove(context, entry.command.commandId);
                await load();
                await onChanged();
              }}
            >
              Descartar tentativa em conflito
            </button>
          )}
        </div>
      ))}
    </>
  );
  if (!gateway.readTaskCard || !gateway.executeTaskCardCommand)
    return <p>Os detalhes adicionais não estão disponíveis nesta conexão.</p>;
  return (
    <div className="card-content">
      {error && !dirty && <p role="alert">{error}</p>}
      {busy && content && <p role="status">Confirmando alteração…</p>}
      {!content && !error && <p role="status">Carregando detalhes…</p>}
      {!dirty && queueFeedback}
      {content && (
        <>
          <section aria-label="Observações" className="card-content-section">
            <div className="card-section-heading">
              <h3>Observações</h3>
              {!readOnly && (
                <button
                  type="button"
                  disabled={disabled || dirty}
                  aria-haspopup="dialog"
                  onClick={() => {
                    setError("");
                    setNotesEditVersion(content.notesVersion);
                    setNotesBaseline(content.notes);
                    setNotes(content.notes);
                  }}
                >
                  Editar observações
                </button>
              )}
            </div>
            <p className="card-notes">
              {content.notes ||
                "Adicione orientações ou informações úteis para esta tarefa."}
            </p>
            {notes !== null && (
              <TaskEditorDialog
                title="Editar observações"
                busy={busy}
                dirty={notes !== notesBaseline}
                onClose={closeDraft}
              >
                {queueFeedback}
                {error && <p role="alert">{error}</p>}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void send({
                      commandId: crypto.randomUUID(),
                      type: "save_notes",
                      payload: {
                        taskId,
                        expectedVersion: notesEditVersion,
                        notes,
                      },
                    });
                  }}
                >
                  <label>
                    Observações
                    <textarea
                      data-dialog-autofocus
                      value={notes}
                      maxLength={10000}
                      rows={6}
                      disabled={disabled}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </label>
                  <div className="card-editor-actions">
                    <DialogCloseButton disabled={busy}>
                      Cancelar
                    </DialogCloseButton>
                    <button className="primary-button" disabled={disabled}>
                      Salvar
                    </button>
                  </div>
                </form>
              </TaskEditorDialog>
            )}
          </section>
          <section aria-label="Checklists" className="card-content-section">
            <div className="card-section-heading">
              <h3>Checklists</h3>
              {!readOnly && (
                <button
                  type="button"
                  aria-haspopup="dialog"
                  disabled={
                    disabled || dirty || content.checklists.length >= 20
                  }
                  onClick={() => {
                    setError("");
                    setDeleteConfirm(false);
                    setNewList(true);
                    const draft = {
                      id: crypto.randomUUID(),
                      title: "",
                      version: 0,
                      items: [],
                    };
                    setEditorBaseline(JSON.stringify(draft));
                    setEditor(draft);
                  }}
                >
                  Adicionar checklist
                </button>
              )}
            </div>
            {content.checklists.length === 0 && (
              <p>Nenhuma checklist adicionada.</p>
            )}
            {content.checklists.map((list) => (
              <section
                key={list.id}
                className="card-checklist"
                aria-label={list.title}
              >
                <div className="card-section-heading">
                  <h4>{list.title}</h4>
                  {!readOnly && (
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      disabled={disabled || dirty}
                      onClick={() => {
                        setError("");
                        setDeleteConfirm(false);
                        setNewList(false);
                        setEditorBaseline(JSON.stringify(list));
                        setEditor(structuredClone(list));
                      }}
                    >
                      Editar checklist {list.title}
                    </button>
                  )}
                </div>
                <p>
                  {list.items.filter((i) => i.completed).length} de{" "}
                  {list.items.length} concluídos
                </p>
                {list.items.length > 0 && (
                  <progress
                    aria-label={`Progresso de ${list.title}`}
                    value={list.items.filter((i) => i.completed).length}
                    max={list.items.length}
                  />
                )}
                {list.items.map((item) => (
                  <label className="card-check-item" key={item.id}>
                    <input
                      type="checkbox"
                      checked={item.completed}
                      disabled={disabled || dirty}
                      onChange={() =>
                        void send({
                          commandId: crypto.randomUUID(),
                          type: "save_checklist",
                          payload: {
                            taskId,
                            expectedVersion: list.version,
                            checklistId: list.id,
                            title: list.title,
                            items: list.items.map((i) =>
                              i.id === item.id
                                ? { ...i, completed: !i.completed }
                                : i,
                            ),
                          },
                        })
                      }
                    />
                    <span className={item.completed ? "completed" : ""}>
                      {item.text}
                    </span>
                  </label>
                ))}
              </section>
            ))}
            {editor && (
              <TaskEditorDialog
                title={
                  deleteConfirm
                    ? "Excluir checklist?"
                    : newList
                      ? "Nova checklist"
                      : "Editar checklist"
                }
                busy={busy}
                dirty={JSON.stringify(editor) !== editorBaseline}
                onClose={closeDraft}
              >
                {queueFeedback}
                {error && <p role="alert">{error}</p>}
                {deleteConfirm ? (
                  <section aria-label="Confirmar exclusão da checklist">
                    <p>
                      A checklist “{editor.title}” e todos os seus itens serão
                      removidos. O rascunho desta lista também será descartado.
                    </p>
                    <div className="card-editor-actions">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setDeleteConfirm(false)}
                      >
                        Manter checklist
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        disabled={disabled}
                        onClick={() =>
                          void send({
                            commandId: crypto.randomUUID(),
                            type: "delete_checklist",
                            payload: {
                              taskId,
                              checklistId: editor.id,
                              expectedVersion: editor.version,
                            },
                          })
                        }
                      >
                        Excluir checklist
                      </button>
                    </div>
                  </section>
                ) : (
                  <ChecklistEditor
                    key={editor.id}
                    list={editor}
                    disabled={disabled}
                    onChange={setEditor}
                    onSave={() =>
                      void send({
                        commandId: crypto.randomUUID(),
                        type: "save_checklist",
                        payload: {
                          taskId,
                          checklistId: editor.id,
                          expectedVersion: editor.version,
                          title: editor.title,
                          items: editor.items,
                        },
                      })
                    }
                    onDelete={
                      newList ? undefined : () => setDeleteConfirm(true)
                    }
                  />
                )}
              </TaskEditorDialog>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ChecklistEditor({
  list,
  disabled,
  onChange,
  onSave,
  onDelete,
}: {
  list: TaskChecklist;
  disabled: boolean;
  onChange: (list: TaskChecklist) => void;
  onSave: () => void;
  onDelete?: (() => void) | undefined;
}) {
  function patch(id: string, fields: Partial<ChecklistItem>) {
    onChange({
      ...list,
      items: list.items.map((i) => (i.id === id ? { ...i, ...fields } : i)),
    });
  }
  function move(index: number, step: number) {
    const items = [...list.items];
    const item = items.splice(index, 1)[0]!;
    items.splice(index + step, 0, item);
    onChange({ ...list, items });
  }
  return (
    <form
      className="card-checklist-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <fieldset disabled={disabled}>
        <label>
          Nome da checklist
          <input
            data-dialog-autofocus
            required
            maxLength={120}
            value={list.title}
            onChange={(e) => onChange({ ...list, title: e.target.value })}
          />
        </label>
        {list.items.map((item, index) => (
          <div className="card-checklist-editor-item" key={item.id}>
            <label>
              Item {index + 1}
              <textarea
                required
                rows={2}
                maxLength={500}
                value={item.text}
                onChange={(e) => patch(item.id, { text: e.target.value })}
              />
            </label>
            <div className="card-item-actions">
              <button
                type="button"
                aria-label={`Mover item ${index + 1} para cima`}
                disabled={disabled || index === 0}
                onClick={() => move(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Mover item ${index + 1} para baixo`}
                disabled={disabled || index === list.items.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...list,
                    items: list.items.filter((i) => i.id !== item.id),
                  })
                }
              >
                Remover item {index + 1}
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          disabled={disabled || list.items.length >= 100}
          onClick={() =>
            onChange({
              ...list,
              items: [
                ...list.items,
                { id: crypto.randomUUID(), text: "", completed: false },
              ],
            })
          }
        >
          Adicionar item
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete}>
            Excluir checklist
          </button>
        )}
        <div className="card-editor-actions">
          <DialogCloseButton>Cancelar</DialogCloseButton>
          <button className="primary-button">Salvar</button>
        </div>
      </fieldset>
    </form>
  );
}
