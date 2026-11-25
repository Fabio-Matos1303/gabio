import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useKeyboardViewport } from "./use-keyboard-viewport.js";

function Form({ modal = false }: { modal?: boolean }) {
  useKeyboardViewport();
  const fields = (
    <div data-testid="scroll" style={{ overflowY: "auto" }}>
      <input aria-label="Texto" defaultValue="Exemplo sintético" />
    </div>
  );
  return modal ? <dialog open>{fields}</dialog> : fields;
}

function setup(modal = false, visualViewport = true) {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(callback, 1),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  vi.stubGlobal("innerHeight", 800);
  const viewport = Object.assign(new EventTarget(), {
    height: 800,
    offsetTop: 0,
    scale: 1,
  });
  vi.stubGlobal("visualViewport", visualViewport ? viewport : undefined);
  const pageScroll = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  const result = render(<Form modal={modal} />);
  const input = result.getByRole("textbox") as HTMLInputElement;
  vi.spyOn(input, "getClientRects").mockReturnValue([
    {},
  ] as unknown as DOMRectList);
  const scroll = result.getByTestId("scroll");
  const rect = (top: number, bottom: number) => ({
    top,
    bottom,
    height: bottom - top,
    left: 0,
    right: 200,
    width: 200,
    x: 0,
    y: top,
    toJSON() {},
  });
  vi.spyOn(input, "getBoundingClientRect").mockReturnValue(rect(620, 668));
  vi.spyOn(scroll, "getBoundingClientRect").mockReturnValue(rect(80, 400));
  Object.defineProperties(scroll, {
    scrollHeight: { value: 1000 },
    clientHeight: { value: 320 },
  });
  scroll.scrollBy = vi.fn();
  const flush = () =>
    act(() => {
      vi.advanceTimersByTime(2);
    });
  act(() => input.focus());
  flush();
  pageScroll.mockClear();
  vi.mocked(scroll.scrollBy).mockClear();
  return { ...result, viewport, input, scroll, pageScroll, flush };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("keyboard viewport", () => {
  it("keeps modal editing above the keyboard without scrolling the locked page or losing selection", () => {
    const { viewport, input, scroll, pageScroll, flush } = setup(true);
    input.setSelectionRange(3, 7);
    viewport.height = 420;
    act(() => {
      viewport.dispatchEvent(new Event("resize"));
    });
    flush();
    expect(
      document.documentElement.style.getPropertyValue(
        "--visible-viewport-height",
      ),
    ).toBe("420px");
    expect(
      document.documentElement.style.getPropertyValue(
        "--visible-viewport-bottom",
      ),
    ).toBe("380px");
    expect(document.documentElement).toHaveAttribute("data-keyboard-open");
    expect(scroll.scrollBy).toHaveBeenCalledWith({
      top: 280,
      behavior: "instant",
    });
    expect(pageScroll).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
    expect([input.selectionStart, input.selectionEnd]).toEqual([3, 7]);
  });

  it("accounts for viewport panning, restores the layout on keyboard close, and cleans up listeners", () => {
    const { viewport, input, unmount, flush } = setup();
    viewport.height = 400;
    viewport.offsetTop = 60;
    act(() => {
      viewport.dispatchEvent(new Event("scroll"));
    });
    flush();
    expect(
      document.documentElement.style.getPropertyValue("--visible-viewport-top"),
    ).toBe("60px");
    expect(
      document.documentElement.style.getPropertyValue(
        "--visible-viewport-bottom",
      ),
    ).toBe("340px");
    act(() => input.blur());
    flush();
    expect(document.documentElement).not.toHaveAttribute("data-keyboard-open");
    viewport.height = 800;
    viewport.offsetTop = 0;
    act(() => {
      viewport.dispatchEvent(new Event("resize"));
    });
    flush();
    expect(
      document.documentElement.style.getPropertyValue(
        "--visible-viewport-height",
      ),
    ).toBe("800px");
    unmount();
    act(() => {
      viewport.dispatchEvent(new Event("resize"));
    });
    flush();
    expect(
      document.documentElement.style.getPropertyValue(
        "--visible-viewport-height",
      ),
    ).toBe("");
  });

  it("leaves pinch zoom to the browser", () => {
    const { viewport, flush, pageScroll, scroll } = setup();
    viewport.scale = 2;
    viewport.height = 300;
    act(() => {
      viewport.dispatchEvent(new Event("resize"));
    });
    flush();
    expect(
      document.documentElement.style.getPropertyValue(
        "--visible-viewport-height",
      ),
    ).toBe("");
    expect(scroll.scrollBy).not.toHaveBeenCalled();
    expect(pageScroll).not.toHaveBeenCalled();
  });

  it("supports page forms when VisualViewport is unavailable", () => {
    const { flush, pageScroll, input } = setup(false, false);
    vi.stubGlobal("innerHeight", 420);
    fireEvent(window, new Event("resize"));
    flush();
    expect(
      document.documentElement.style.getPropertyValue(
        "--visible-viewport-height",
      ),
    ).toBe("420px");
    expect(pageScroll).toHaveBeenCalledWith({ top: 260, behavior: "instant" });
    expect(input).toHaveFocus();
  });
});
