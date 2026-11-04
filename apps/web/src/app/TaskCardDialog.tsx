import {
  createContext,
  useContext,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { useDialogMotion } from "./use-dialog-motion.js";

const DialogCloseContext = createContext<(() => void) | undefined>(undefined);

export function DialogCloseButton(
  props: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type">,
) {
  const close = useContext(DialogCloseContext);
  return <button {...props} type="button" onClick={close} />;
}

export function TaskCardDialog({
  open,
  title,
  onClose,
  busy = false,
  children,
  className = "",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const requestClose = useDialogMotion(ref, open, busy, onClose);
  return (
    <dialog
      ref={ref}
      className={`task-dialog glass-surface ${className}`}
      aria-labelledby={id}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
          ),
        ).filter(
          (element) =>
            element.getClientRects().length > 0 && element.tabIndex >= 0,
        );
        const first = controls[0];
        const last = controls.at(-1);
        if (
          first &&
          last &&
          ((event.shiftKey && document.activeElement === first) ||
            (!event.shiftKey && document.activeElement === last))
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
    >
      <header className="task-dialog-heading">
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          aria-label={`Fechar ${title.toLocaleLowerCase("pt-BR")}`}
          disabled={busy}
          onClick={requestClose}
        >
          ×
        </button>
      </header>
      <DialogCloseContext.Provider value={requestClose}>
        {children}
      </DialogCloseContext.Provider>
    </dialog>
  );
}
