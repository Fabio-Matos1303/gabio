import { useId, useState } from "react";
import type { TagRecord } from "../lib/task-views.js";
export function parseTagInput(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}
export function TaskTagFields({
  tags = [],
  catalog = [],
  visibility,
  disabled = false,
}: {
  tags?: string[];
  catalog?: TagRecord[];
  visibility: "private" | "household";
  disabled?: boolean;
}) {
  const [value, setValue] = useState(tags.join(", "));
  const id = useId();
  return (
    <fieldset className="task-tag-fields" disabled={disabled}>
      <legend>Tags</legend>
      <label htmlFor={id}>Separe as tags por vírgulas</label>
      <input
        id={id}
        name="tags"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ex.: Casa, Compras"
        aria-describedby={`${id}-help`}
      />
      <small id={`${id}-help`}>
        Até 10 tags, com 32 caracteres cada.{" "}
        {visibility === "private"
          ? "Visíveis somente para você."
          : "Visíveis para a casa."}
      </small>
      <div className="tag-suggestions">
        {catalog
          .filter(
            (t) =>
              t.visibility === visibility &&
              !parseTagInput(value).some(
                (n) =>
                  n.toLocaleLowerCase("pt-BR") ===
                  t.name.toLocaleLowerCase("pt-BR"),
              ),
          )
          .slice(0, 12)
          .map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() =>
                setValue([...parseTagInput(value), t.name].join(", "))
              }
            >
              {t.name}
            </button>
          ))}
      </div>
    </fieldset>
  );
}
