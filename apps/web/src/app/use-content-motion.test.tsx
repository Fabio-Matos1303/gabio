import { useRef } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useContentMotion } from "./use-content-motion.js";

function Content({ value }: { value: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useContentMotion(ref, value);
  return (
    <div ref={ref}>
      <input defaultValue="Rascunho sintético" />
    </div>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("content motion", () => {
  it("cancels interrupted transitions and preserves the existing DOM", () => {
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }) as unknown as Animation);
    vi.stubGlobal("matchMedia", () =>
      Object.assign(new EventTarget(), { matches: false }),
    );
    const { container, rerender, unmount } = render(<Content value="kanban" />);
    const element = container.firstElementChild as HTMLElement;
    element.animate = animate;
    const input = container.querySelector("input");
    rerender(<Content value="calendar" />);
    expect(animate).toHaveBeenCalledTimes(1);
    rerender(<Content value="kanban" />);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(animate).toHaveBeenCalledTimes(2);
    expect(container.querySelector("input")).toBe(input);
    unmount();
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it("cancels active motion and skips subsequent animation with reduced motion", () => {
    const preference = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal("matchMedia", () => preference);
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }) as unknown as Animation);
    const { container, rerender } = render(<Content value="kanban" />);
    (container.firstElementChild as HTMLElement).animate = animate;
    rerender(<Content value="calendar" />);
    preference.matches = true;
    act(() => preference.dispatchEvent(new Event("change")));
    expect(cancel).toHaveBeenCalled();
    rerender(<Content value="kanban" />);
    expect(animate).toHaveBeenCalledTimes(1);
  });
});
