import { useId, useState } from "react";
import type {
  Task,
  TaskRecurrence,
  TaskRecurrenceRule,
} from "@gabio/contracts";

const presets = [
  ["none", "Não repetir"],
  ["daily", "Diariamente"],
  ["weekly", "Semanalmente"],
  ["fortnightly", "A cada 2 semanas"],
  ["monthly", "Mensalmente"],
  ["quarterly", "A cada 3 meses"],
  ["semiannually", "A cada 6 meses"],
  ["yearly", "Anualmente"],
  ["custom", "Personalizar…"],
] as const;
const weekDays = [
  [1, "Segunda"],
  [2, "Terça"],
  [3, "Quarta"],
  [4, "Quinta"],
  [5, "Sexta"],
  [6, "Sábado"],
  [0, "Domingo"],
] as const;
const units = {
  daily: ["dia", "dias"],
  weekly: ["semana", "semanas"],
  monthly: ["mês", "meses"],
  yearly: ["ano", "anos"],
};

export function taskRecurrenceLabel(
  recurrence: TaskRecurrence,
  rule?: TaskRecurrenceRule | null,
) {
  if (recurrence === "none") return null;
  if (recurrence !== "custom" || !rule)
    return {
      daily: "Diária",
      weekly: "Semanal",
      monthly: "Mensal",
      custom: "Personalizada",
    }[recurrence];
  const days = rule.weekdays.length
    ? ` · ${weekDays
        .filter(([day]) => rule.weekdays.includes(day))
        .map(([, label]) => label.slice(0, 3))
        .join(", ")}`
    : "";
  return `A cada ${rule.interval} ${units[rule.frequency][rule.interval === 1 ? 0 : 1]}${days}${rule.until ? ` · até ${rule.until.split("-").reverse().join("/")}` : ""}`;
}

export function TaskRecurrenceFields({
  task,
  disabled = false,
}: {
  task?: Task;
  disabled?: boolean;
}) {
  const id = useId();
  const [preset, setPreset] = useState<string>(task?.recurrence ?? "none");
  const [frequency, setFrequency] = useState<TaskRecurrenceRule["frequency"]>(
    task?.recurrenceRule?.frequency ?? "weekly",
  );
  const [interval, setInterval] = useState<number | "">(
    task?.recurrenceRule?.interval ?? 1,
  );
  const [days, setDays] = useState<number[]>(
    task?.recurrenceRule?.weekdays ?? [],
  );
  const [until, setUntil] = useState(task?.recurrenceRule?.until ?? "");
  const standard =
    ["none", "daily", "weekly", "monthly"].includes(preset) && !until;
  const recurrence = standard ? preset : "custom";
  const presetRule: Record<string, [TaskRecurrenceRule["frequency"], number]> =
    {
      daily: ["daily", 1],
      weekly: ["weekly", 1],
      fortnightly: ["weekly", 2],
      monthly: ["monthly", 1],
      quarterly: ["monthly", 3],
      semiannually: ["monthly", 6],
      yearly: ["yearly", 1],
    };
  const pair = presetRule[preset] ?? [frequency, interval];
  const rule =
    recurrence === "custom"
      ? {
          frequency: pair[0],
          interval: pair[1],
          weekdays: preset === "custom" && frequency === "weekly" ? days : [],
          until: until || null,
          timeZone: "America/Bahia",
        }
      : null;
  return (
    <fieldset className="task-recurrence" disabled={disabled}>
      <legend>Recorrência</legend>
      <label htmlFor={`${id}-repeat`}>Repetir</label>
      <select
        id={`${id}-repeat`}
        value={preset}
        onChange={(event) => {
          setPreset(event.target.value);
          if (event.target.value === "none") setUntil("");
        }}
      >
        {presets.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input type="hidden" name="recurrence" value={recurrence} />
      <input
        type="hidden"
        name="recurrenceRule"
        value={rule ? JSON.stringify(rule) : ""}
      />
      {preset === "custom" && (
        <>
          <div className="task-recurrence-interval">
            <label>
              A cada
              <input
                name="recurrenceInterval"
                type="number"
                min="1"
                max="365"
                step="1"
                required
                value={interval}
                onChange={(event) =>
                  setInterval(
                    event.target.value === "" ? "" : Number(event.target.value),
                  )
                }
              />
            </label>
            <label>
              Unidade
              <select
                value={frequency}
                onChange={(event) =>
                  setFrequency(
                    event.target.value as TaskRecurrenceRule["frequency"],
                  )
                }
              >
                {Object.entries(units).map(([value, labels]) => (
                  <option key={value} value={value}>
                    {labels[interval === 1 ? 0 : 1]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {frequency === "weekly" && (
            <fieldset className="task-weekdays">
              <legend>Dias da semana</legend>
              {weekDays.map(([day, label]) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={days.includes(day)}
                    onChange={(event) =>
                      setDays((current) =>
                        event.target.checked
                          ? [...current, day].sort((a, b) => a - b)
                          : current.filter((value) => value !== day),
                      )
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
              <p className="field-hint">
                Sem seleção, repete no dia do primeiro prazo.
              </p>
            </fieldset>
          )}
        </>
      )}
      {preset !== "none" && (
        <label>
          Repetir até (opcional)
          <input
            name="recurrenceUntil"
            type="date"
            value={until}
            onChange={(event) => setUntil(event.target.value)}
          />
        </label>
      )}
      {preset !== "none" && (
        <p className="field-hint">
          A primeira data define o início. Horário de Brasília (Bahia). A
          próxima ocorrência é criada ao concluir a atual.
        </p>
      )}
    </fieldset>
  );
}
