import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TaskCardDialog } from "./TaskCardDialog.js";

// Editors live outside the card DOM so native modal focus/inert behavior is
// independent of the card's scroll area and the other editor forms.
export function TaskEditorDialog({
  title,
  busy,
  dirty,
  onClose,
  children,
}: {
  title: string;
  busy: boolean;
  dirty: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [discard, setDiscard] = useState(false);
  return createPortal(
    <TaskCardDialog
      open
      title={discard ? "Descartar alterações?" : title}
      className="task-editor-dialog"
      busy={busy}
      onClose={onClose}
      canClose={() => {
        if (discard) {
          setDiscard(false);
          return false;
        }
        if (dirty) {
          setDiscard(true);
          return false;
        }
        return true;
      }}
    >
      <div className="task-editor-content">
        {busy && <p role="status">Salvando alterações…</p>}
        <div hidden={discard}>{children}</div>
        {discard && (
          <section aria-label="Confirmar descarte">
            <p>As alterações ainda não salvas serão descartadas.</p>
            <div className="card-editor-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDiscard(false)}
                autoFocus
              >
                Continuar editando
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={onClose}
              >
                Descartar alterações
              </button>
            </div>
          </section>
        )}
      </div>
    </TaskCardDialog>,
    document.body,
  );
}
