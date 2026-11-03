import { useState } from "react";
import type { Task, TaskKind } from "@gabio/contracts";

function localValue(value?: string | null) {
  return value
    ? new Date(Date.parse(value) - 3 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 16)
    : "";
}
export function TaskKindFields({
  task,
  disabled = false,
  onKindChange,
}: {
  task?: Task;
  disabled?: boolean;
  onKindChange?: (kind: TaskKind) => void;
}) {
  const [kind, setKind] = useState<TaskKind>(task?.kind ?? "task");
  const [end, setEnd] = useState(localValue(task?.eventEndsAt));
  return (
    <>
      <label>
        Tipo do item
        <select
          name="kind"
          value={kind}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value as TaskKind;
            setKind(next);
            onKindChange?.(next);
          }}
        >
          <option value="task">Tarefa</option>
          <option value="event">Evento</option>
        </select>
      </label>
      <p>
        Eventos usam o Google Agenda. Tarefas seguem o destino escolhido em
        Ajustes.
      </p>
      <label>
        {kind === "event"
          ? "Início do evento"
          : task
            ? "Prazo"
            : "Primeiro prazo"}
        <input
          name="dueAt"
          type="datetime-local"
          defaultValue={localValue(task?.dueAt)}
          required={kind === "event"}
          disabled={disabled}
        />
      </label>
      {kind === "event" && (
        <label>
          Fim do evento
          <input
            name="eventEndsAt"
            type="datetime-local"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            required
            disabled={disabled}
          />
        </label>
      )}
    </>
  );
}
