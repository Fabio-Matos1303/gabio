import { useEffect, useId, useRef } from "react";
import type { FormEvent, ReactNode } from "react";
import type { HouseholdContext } from "../lib/app-gateway.js";
import { TaskRecurrenceFields } from "./TaskRecurrenceFields.js";

export function TaskCreationDialog({
  open,
  busy,
  title,
  setTitle,
  onClose,
  onSubmit,
  household,
  feedback,
  resetKey,
}: {
  open: boolean;
  busy: boolean;
  title: string;
  setTitle: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  household: HouseholdContext;
  feedback: ReactNode;
  resetKey: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      element.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
    } else if (!open && element.open) element.close();
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="task-dialog glass-surface"
      aria-labelledby={`${id}-heading`}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (
          first &&
          last &&
          ((event.shiftKey && document.activeElement === first) ||
            (!event.shiftKey && document.activeElement === last))
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="task-dialog-heading">
        <h2 id={`${id}-heading`}>Nova tarefa</h2>
        <button
          type="button"
          aria-label="Fechar criação de tarefa"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <form key={resetKey} className="task-dialog-form" onSubmit={onSubmit}>
        <div className="task-dialog-fields">
          {open && feedback}
          <label>
            Título
            <input
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={240}
              disabled={busy}
              placeholder="O que precisa ser feito?"
            />
          </label>
          <label>
            Primeiro prazo
            <input name="dueAt" type="datetime-local" disabled={busy} />
          </label>
          <label>
            Responsável
            <select name="assigneeUserId" defaultValue="" disabled={busy}>
              <option value="">Sem responsável</option>
              {household.members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </label>
          <TaskRecurrenceFields disabled={busy} />
          <label>
            Quem pode ver
            <select name="visibility" defaultValue="household" disabled={busy}>
              <option value="household">Todos da casa</option>
              <option value="private">Somente eu</option>
            </select>
          </label>
        </div>
        <footer className="task-dialog-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? "Enviando…" : "Criar tarefa"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
