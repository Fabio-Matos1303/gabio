import { useLayoutEffect, useRef, type RefObject } from "react";

// Shared locks also handle a dialog opening while another one is closing.
const scrollLocks = new Set<HTMLDialogElement>();
let previousOverflow = "";

function lockScroll(dialog: HTMLDialogElement) {
  if (!scrollLocks.size) previousOverflow = document.body.style.overflow;
  scrollLocks.add(dialog);
  document.body.style.overflow = "hidden";
}

function unlockScroll(dialog: HTMLDialogElement) {
  if (scrollLocks.delete(dialog) && !scrollLocks.size)
    document.body.style.overflow = previousOverflow;
}

export function useDialogMotion(
  ref: RefObject<HTMLDialogElement | null>,
  open: boolean,
  busy: boolean,
  onClose: () => void,
) {
  const latest = useRef({ busy, onClose });
  const lifecycle = useRef<{
    show: () => void;
    dismiss: () => void;
    requestClose: () => void;
  } | null>(null);
  useLayoutEffect(() => {
    latest.current = { busy, onClose };
  });

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let trigger: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closing = false;

    const dismiss = () => {
      clearTimeout(timer);
      closing = false;
      delete dialog.dataset.motion;
      dialog.inert = false;
      if (dialog.open) dialog.close();
      unlockScroll(dialog);
      // Never move focus into a hidden route, or out of a newly opened dialog.
      if (
        trigger?.isConnected &&
        !trigger.closest("[hidden], [inert]") &&
        !document.querySelector("dialog[open]")
      )
        trigger.focus({ preventScroll: true });
      trigger = null;
    };
    const complete = () => {
      if (!closing) return;
      dismiss();
      latest.current.onClose();
    };
    const onAnimationEnd = (event: AnimationEvent) => {
      if (
        event.target === dialog &&
        !event.pseudoElement &&
        event.animationName.endsWith("-exit")
      )
        complete();
    };
    const onPreferenceChange = () => {
      if (media?.matches) complete();
    };
    const onRouteChange = () => {
      if (!dialog.open) return;
      dismiss();
      latest.current.onClose();
    };
    lifecycle.current = {
      show() {
        if (closing) {
          clearTimeout(timer);
          closing = false;
          delete dialog.dataset.motion;
          dialog.inert = false;
        }
        if (dialog.open) return;
        trigger = document.activeElement as HTMLElement | null;
        dialog.showModal();
        lockScroll(dialog);
        dialog
          .querySelector<HTMLInputElement>(
            'input[name="title"]:not(:disabled), input[name="search"]:not(:disabled)',
          )
          ?.focus({ preventScroll: true });
      },
      dismiss,
      requestClose() {
        if (latest.current.busy || closing || !dialog.open) return;
        closing = true;
        dialog.dataset.motion = "closing";
        const style = getComputedStyle(dialog);
        const duration = parseFloat(style.animationDuration) * 1000;
        if (media?.matches || !duration || style.animationName === "none") {
          complete();
          return;
        }
        // No form action can race a user dismissal. The native modal retains focus.
        dialog.inert = true;
        timer = setTimeout(complete, duration + 50);
      },
    };
    dialog.addEventListener("animationend", onAnimationEnd);
    dialog.addEventListener("animationcancel", onAnimationEnd);
    media?.addEventListener("change", onPreferenceChange);
    window.addEventListener("hashchange", onRouteChange);
    return () => {
      dialog.removeEventListener("animationend", onAnimationEnd);
      dialog.removeEventListener("animationcancel", onAnimationEnd);
      media?.removeEventListener("change", onPreferenceChange);
      window.removeEventListener("hashchange", onRouteChange);
      // Unmounts, session changes and route changes must never retain private DOM.
      dismiss();
      lifecycle.current = null;
    };
  }, [ref]);

  useLayoutEffect(() => {
    if (open) lifecycle.current?.show();
    else lifecycle.current?.dismiss();
  }, [open]);

  return () => lifecycle.current?.requestClose();
}
