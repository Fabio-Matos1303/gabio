import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App.js";

describe("App", () => {
  it("presents the three primary household areas", () => {
    render(<App />);

    expect(screen.getByRole("link", { name: "Tarefas" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Finanças" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agenda" })).toBeInTheDocument();
  });

  it("offers natural-language input", () => {
    render(<App />);

    expect(
      screen.getByPlaceholderText("Escreva em linguagem natural…"),
    ).toBeDisabled();
    expect(
      screen.getByText(/Entrada desativada até login/),
    ).toBeInTheDocument();
  });
});
