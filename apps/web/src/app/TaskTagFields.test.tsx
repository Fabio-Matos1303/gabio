import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TaskTagFields, parseTagInput } from "./TaskTagFields.js";

describe("Task tag selection", () => {
  it("finds the full permitted catalog and submits explicit chip choices", () => {
    const catalog = Array.from({ length: 16 }, (_, i) => ({
      id: String(i),
      name: `Categoria ${i}`,
      visibility: "household" as const,
      version: 1,
    }));
    render(
      <form aria-label="Tarefa">
        <TaskTagFields
          catalog={[
            ...catalog,
            {
              id: "private",
              name: "Privada",
              visibility: "private",
              version: 1,
            },
          ]}
          visibility="household"
        />
      </form>,
    );
    expect(screen.queryByRole("checkbox", { name: "Privada" })).toBeNull();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Buscar ou criar tag" }),
      { target: { value: "Categoria 15" } },
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Categoria 15" }));
    const form = screen.getByRole("form", {
      name: "Tarefa",
    }) as HTMLFormElement;
    expect(parseTagInput(new FormData(form).get("tags"))).toEqual([
      "Categoria 15",
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: "Remover tag Categoria 15" }),
    );
    expect(parseTagInput(new FormData(form).get("tags"))).toEqual([]);
  });
  it("creates a draft tag explicitly and prevents case duplicates", () => {
    render(<TaskTagFields visibility="private" tags={["Casa"]} />);
    const input = screen.getByRole("textbox", { name: "Buscar ou criar tag" });
    fireEvent.change(input, { target: { value: "casa" } });
    expect(screen.queryByRole("button", { name: /Criar/ })).toBeNull();
    fireEvent.change(input, { target: { value: "  Compras  " } });
    fireEvent.click(screen.getByRole("button", { name: "+ Criar “Compras”" }));
    expect(
      screen.getByRole("button", { name: "Remover tag Compras" }),
    ).toBeInTheDocument();
  });
  it("preserves comma-containing catalog names as one tag", () => {
    render(
      <form aria-label="Tarefa">
        <TaskTagFields
          visibility="household"
          catalog={[
            {
              id: "1",
              name: "Casa, Compras",
              visibility: "household",
              version: 1,
            },
          ]}
        />
      </form>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Casa, Compras" }));
    const form = screen.getByRole("form", {
      name: "Tarefa",
    }) as HTMLFormElement;
    expect(parseTagInput(new FormData(form).get("tags"))).toEqual([
      "Casa, Compras",
    ]);
  });
});
