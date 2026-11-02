import { useId, useState } from "react";
import type { TagRecord } from "../lib/task-views.js";
export function parseTagInput(value: FormDataEntryValue | null) {
  const raw = String(value ?? "");
  if (raw.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string"))
        return parsed as string[];
    } catch {
      /* Existing comma-separated drafts remain readable. */
    }
  }
  return raw
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
  const [selected, setSelected] = useState(tags);
  const [query, setQuery] = useState("");
  const id = useId();
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ");
  const same = (a: string, b: string) =>
    a.toLocaleLowerCase("pt-BR") === b.toLocaleLowerCase("pt-BR");
  const names = Array.from(
    new Set([
      ...selected,
      ...catalog.filter((t) => t.visibility === visibility).map((t) => t.name),
    ]),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const matches = names.filter((n) =>
    n.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")),
  );
  const candidate = normalize(query);
  const toggle = (name: string) =>
    setSelected((current) =>
      current.some((n) => same(n, name))
        ? current.filter((n) => !same(n, name))
        : [...current, name],
    );
  const canCreate =
    candidate.length > 0 &&
    candidate.length <= 32 &&
    !names.some((n) => same(n, candidate));
  return (
    <fieldset className="task-tag-fields" disabled={disabled}>
      <legend>Tags</legend>
      <input name="tags" type="hidden" value={JSON.stringify(selected)} />
      <div className="tag-selected" aria-label="Tags selecionadas">
        {selected.map((name) => (
          <button
            key={name}
            type="button"
            className="tag-chip"
            aria-label={`Remover tag ${name}`}
            onClick={() => toggle(name)}
          >
            {name}
            <span aria-hidden="true"> ×</span>
          </button>
        ))}
        {!selected.length && <small>Nenhuma tag selecionada</small>}
      </div>
      <label htmlFor={id}>Buscar ou criar tag</label>
      <input
        id={id}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ex.: Compras"
        aria-describedby={`${id}-help`}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (canCreate && selected.length < 10) {
              toggle(candidate);
              setQuery("");
            }
          }
        }}
      />
      <small id={`${id}-help`}>
        {selected.length}/10 selecionadas ·{" "}
        {visibility === "private" ? "Somente eu" : "Da casa"}. Até 32 caracteres
        por tag.
      </small>
      <div className="tag-options" aria-label="Tags disponíveis">
        {matches.map((name) => (
          <label className="task-check" key={name}>
            <input
              type="checkbox"
              checked={selected.some((n) => same(n, name))}
              disabled={
                disabled ||
                (selected.length >= 10 && !selected.some((n) => same(n, name)))
              }
              onChange={() => toggle(name)}
            />
            {name}
          </label>
        ))}
        {canCreate && (
          <button
            type="button"
            disabled={selected.length >= 10}
            onClick={() => {
              toggle(candidate);
              setQuery("");
            }}
          >
            + Criar “{candidate}”
          </button>
        )}
        {!matches.length && !canCreate && (
          <small>Nenhuma tag encontrada.</small>
        )}
      </div>
      <small>Novas tags são criadas ao salvar a tarefa.</small>
    </fieldset>
  );
}
