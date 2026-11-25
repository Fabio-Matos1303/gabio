import { useEffect } from "react";

function isEditable(element: Element | null): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.matches(
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not(:disabled):not([readonly]), textarea:not(:disabled):not([readonly]), [contenteditable="true"]',
    )
  );
}

// Shared by authentication, settings, finance and every native task dialog.
export function useKeyboardViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    let frame = 0;
    const properties = [
      "--visible-viewport-height",
      "--visible-viewport-top",
      "--visible-viewport-bottom",
    ];
    const reset = () => {
      properties.forEach((property) => root.style.removeProperty(property));
      delete root.dataset.keyboardOpen;
    };
    const update = () => {
      frame = 0;
      // Let the browser handle pinch zoom without reflowing the dialog.
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) {
        reset();
        return;
      }
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      const bottom = Math.max(0, window.innerHeight - height - top);
      root.style.setProperty(properties[0]!, `${height}px`);
      root.style.setProperty(properties[1]!, `${top}px`);
      root.style.setProperty(properties[2]!, `${bottom}px`);

      const active = document.activeElement;
      const editing = isEditable(active);
      root.toggleAttribute("data-keyboard-open", editing && bottom > 80);
      if (!editing || !active.getClientRects().length) return;

      const dialog = active.closest("dialog[open]");
      let visibleTop = top + 12;
      let visibleBottom = top + height - 12;
      if (dialog) {
        const heading = dialog.querySelector(".task-dialog-heading");
        const footer = dialog.querySelector(".task-dialog-actions");
        if (heading)
          visibleTop = Math.max(
            visibleTop,
            heading.getBoundingClientRect().bottom + 12,
          );
        if (footer)
          visibleBottom = Math.min(
            visibleBottom,
            footer.getBoundingClientRect().top - 12,
          );
      } else {
        const navigation = document.querySelector(".bottom-nav");
        if (navigation && navigation.getClientRects().length)
          visibleBottom = Math.min(
            visibleBottom,
            navigation.getBoundingClientRect().top - 12,
          );
      }

      // Scroll only the necessary distance, innermost scroll container first.
      // Never scroll the locked page behind a modal or steal focus/selection.
      let parent = active.parentElement;
      while (parent && parent !== document.body && parent !== dialog) {
        const style = getComputedStyle(parent);
        if (
          /(auto|scroll)/.test(style.overflowY) &&
          parent.scrollHeight > parent.clientHeight
        ) {
          const bounds = parent.getBoundingClientRect();
          reveal(
            parent,
            Math.max(visibleTop, bounds.top + 12),
            Math.min(visibleBottom, bounds.bottom - 12),
          );
        }
        parent = parent.parentElement;
      }
      if (!dialog) reveal(window, visibleTop, visibleBottom);

      function reveal(
        container: HTMLElement | Window,
        start: number,
        end: number,
      ) {
        if (end <= start) return;
        const bounds = active!.getBoundingClientRect();
        const delta =
          bounds.top < start || bounds.height > end - start
            ? bounds.top - start
            : Math.max(0, bounds.bottom - end);
        if (Math.abs(delta) > 1)
          container.scrollBy({ top: delta, behavior: "instant" });
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    document.addEventListener("animationend", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      document.removeEventListener("animationend", schedule);
      reset();
    };
  }, []);
}
