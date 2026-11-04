import { DialogCloseButton, TaskCardDialog } from "./TaskCardDialog.js";
import type { TagRecord } from "../lib/task-views.js";
import { TaskTagFields } from "./TaskTagFields.js";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { HouseholdContext } from "../lib/app-gateway.js";
import { TaskRecurrenceFields } from "./TaskRecurrenceFields.js";
import { TaskKindFields } from "./TaskKindFields.js";
import type { TaskKind } from "@gabio/contracts";

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
  catalog = [],
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
  catalog?: TagRecord[];
}) {
  const [visibility, setVisibility] = useState<"household" | "private">(
    "household",
  );
  useEffect(() => setVisibility("household"), [resetKey]);
  const [kind, setKind] = useState<TaskKind>("task");
  useEffect(() => setKind("task"), [resetKey]);
  return (
    <TaskCardDialog
      open={open}
      title={kind === "event" ? "Novo evento" : "Nova tarefa"}
      busy={busy}
      onClose={onClose}
    >
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
          <TaskKindFields
            key={resetKey}
            disabled={busy}
            onKindChange={setKind}
          />
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
          <TaskTagFields
            key={resetKey + visibility}
            catalog={catalog}
            visibility={visibility}
            disabled={busy}
          />
          <label>
            Quem pode ver
            <select
              name="visibility"
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value as "household" | "private")
              }
              disabled={busy}
            >
              <option value="household">Todos da casa</option>
              <option value="private">Somente eu</option>
            </select>
          </label>
        </div>
        <footer className="task-dialog-actions">
          <DialogCloseButton className="secondary-button" disabled={busy}>
            Cancelar
          </DialogCloseButton>
          <button className="primary-button" disabled={busy}>
            {busy
              ? "Enviando…"
              : kind === "event"
                ? "Criar evento"
                : "Criar tarefa"}
          </button>
        </footer>
      </form>
    </TaskCardDialog>
  );
}
