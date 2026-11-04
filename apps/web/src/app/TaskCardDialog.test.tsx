import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DialogCloseButton, TaskCardDialog } from "./TaskCardDialog.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

function setup() {
  vi.useFakeTimers();
  const close = vi.fn();
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  const result = render(
    <StrictMode>
      <TaskCardDialog open title="Diálogo de teste" onClose={close}>
        <input
          name="title"
          aria-label="Título"
          defaultValue="Rascunho sintético"
        />
        <DialogCloseButton>Cancelar</DialogCloseButton>
      </TaskCardDialog>
    </StrictMode>,
  );
  const dialog = screen.getByRole("dialog") as HTMLDialogElement;
  // jsdom has no stylesheet animation engine. Simulate a browser-computed exit.
  dialog.style.animationDuration = "0.18s";
  dialog.style.animationName = "sheet-exit";
  return { ...result, close, dialog, trigger };
}

describe("dialog motion lifecycle", () => {
  it("finalizes once using the fallback, restores focus and preserves the draft", () => {
    const { close, dialog, trigger, unmount } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(dialog).toHaveAttribute("data-motion", "closing");
    expect(dialog.inert).toBe(true);
    expect(close).not.toHaveBeenCalled();
    act(() => vi.runAllTimers());
    expect(close).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(false);
    expect(document.body.style.overflow).toBe("");
    expect(trigger).toHaveFocus();
    expect(screen.getByLabelText("Título")).toHaveValue("Rascunho sintético");
    unmount();
    trigger.remove();
  });

  it("dismisses immediately on route change even during an exit", () => {
    const { close, dialog, trigger, unmount } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    act(() => window.dispatchEvent(new Event("hashchange")));
    expect(dialog.open).toBe(false);
    expect(document.body.style.overflow).toBe("");
    expect(close).toHaveBeenCalledTimes(1);
    act(() => vi.runAllTimers());
    expect(close).toHaveBeenCalledTimes(1);
    unmount();
    trigger.remove();
  });

  it("cancels pending callbacks on unmount without retaining a scroll lock", () => {
    const { close, trigger, unmount } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    unmount();
    act(() => vi.runAllTimers());
    expect(close).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe("");
    trigger.remove();
  });

  it("keeps a second dialog locked when the first one closes", () => {
    const { dialog, trigger, unmount } = setup();
    const other = render(
      <TaskCardDialog open title="Outro diálogo" onClose={() => {}}>
        <p>Conteúdo sintético</p>
      </TaskCardDialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    act(() => vi.runAllTimers());
    expect(dialog.open).toBe(false);
    expect(document.body.style.overflow).toBe("hidden");
    other.unmount();
    expect(document.body.style.overflow).toBe("");
    unmount();
    trigger.remove();
  });

  it("prevents user dismissal while busy but allows an immediate controlled close", () => {
    const close = vi.fn();
    const { rerender } = render(
      <TaskCardDialog open busy title="Operação" onClose={close}>
        <DialogCloseButton>Cancelar</DialogCloseButton>
      </TaskCardDialog>,
    );
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(dialog.open).toBe(true);
    expect(close).not.toHaveBeenCalled();
    rerender(
      <TaskCardDialog open={false} busy title="Operação" onClose={close}>
        Fechado
      </TaskCardDialog>,
    );
    expect(dialog.open).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });

  it("finishes an active exit when reduced motion is enabled", () => {
    const preference = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal("matchMedia", () => preference);
    const { close, dialog, trigger, unmount } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    preference.matches = true;
    act(() => preference.dispatchEvent(new Event("change")));
    expect(dialog.open).toBe(false);
    expect(close).toHaveBeenCalledTimes(1);
    act(() => vi.runAllTimers());
    expect(close).toHaveBeenCalledTimes(1);
    unmount();
    trigger.remove();
  });
});
