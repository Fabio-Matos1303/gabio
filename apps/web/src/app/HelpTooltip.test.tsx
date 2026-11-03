import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { HelpTooltip } from "./HelpTooltip.js";
describe("Contextual integration help", () => {
  it("supports tap, outside dismissal and keyboard Escape", () => {
    render(<HelpTooltip label="Sobre a leitura">Ajuda fictícia.</HelpTooltip>);
    const button = screen.getByRole("button", { name: "Sobre a leitura" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Ajuda fictícia.");
    expect(button).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(button, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("keeps help available while the button has keyboard focus", () => {
    render(<HelpTooltip label="Sobre o envio">Texto de exemplo.</HelpTooltip>);
    const button = screen.getByRole("button", { name: "Sobre o envio" });
    act(() => button.focus());
    fireEvent.mouseLeave(button.parentElement!);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Texto de exemplo.");
    fireEvent.blur(button);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
