import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { taskSchema, type TaskCardContent } from "@gabio/contracts";
import { TaskDetailsDialog } from "./TaskDetailsDialog.js";
import { MemoryCardCommandQueue } from "../lib/task-card-queue.js";
import { GatewayError, type AppGateway } from "../lib/app-gateway.js";
const userId = "10000000-0000-4000-8000-000000000001";
const household = {
  id: "20000000-0000-4000-8000-000000000001",
  name: "Casa sintética",
  role: "owner" as const,
  members: [{ userId, displayName: "Pessoa A", role: "owner" as const }],
};
const task = taskSchema.parse({
  id: "30000000-0000-4000-8000-000000000001",
  householdId: household.id,
  ownerUserId: userId,
  createdBy: userId,
  assigneeUserId: null,
  title: "Organizar materiais",
  dueAt: null,
  visibility: "household",
  recurrence: "none",
  status: "open",
  completedAt: null,
  version: 1,
  createdAt: "2026-11-24T12:00:00Z",
  updatedAt: "2026-11-24T12:00:00Z",
});
const initial: TaskCardContent = {
  taskId: task.id,
  notes: "Texto inicial",
  notesVersion: 1,
  checklists: [],
};
function setup() {
  const read = vi.fn().mockResolvedValue(initial);
  const execute = vi.fn().mockResolvedValue({
    commandId: crypto.randomUUID(),
    taskId: task.id,
    replayed: false,
  });
  const props = {
    task,
    gateway: {
      readTaskCard: read,
      executeTaskCardCommand: execute,
    } as unknown as AppGateway,
    userId,
    household,
    catalog: [],
    busy: false,
    pending: false,
    contentPending: false,
    cardQueue: new MemoryCardCommandQueue(),
    feedback: null,
    onClose: vi.fn(),
    onUpdate: vi.fn().mockResolvedValue(true),
    onChanged: vi.fn().mockResolvedValue(true),
  };
  return { props, read, execute };
}
describe("task details", () => {
  it("saves only the edited field using the version captured before a remote refresh", async () => {
    const { props } = setup();
    const view = render(<TaskDetailsDialog {...props} />);
    await screen.findByText("Texto inicial");
    fireEvent.click(screen.getByRole("button", { name: "Editar título" }));
    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Meu rascunho" },
    });
    view.rerender(
      <TaskDetailsDialog
        {...props}
        task={{ ...task, title: "Alteração remota", version: 2 }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar alteração" }));
    await waitFor(() =>
      expect(props.onUpdate).toHaveBeenCalledWith({ title: "Meu rascunho" }, 1),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("retains the notes edit version after refreshing details and clears revoked content", async () => {
    const { props, read, execute } = setup();
    render(<TaskDetailsDialog {...props} />);
    await screen.findByText("Texto inicial");
    fireEvent.click(screen.getByRole("button", { name: "Editar observações" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Observações" }), {
      target: { value: "Meu rascunho" },
    });
    read.mockResolvedValue({
      ...initial,
      notes: "Versão remota",
      notesVersion: 2,
    });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar observações" }));
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            notes: "Meu rascunho",
            expectedVersion: 1,
          }),
        }),
      ),
    );
    await screen.findByText("Versão remota");
    read.mockRejectedValue(new GatewayError(undefined, "conflict"));
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() =>
      expect(screen.queryByText("Versão remota")).not.toBeInTheDocument(),
    );
  });
  it("validates whitespace checklist input and submits ordered items", async () => {
    const { props, execute } = setup();
    render(<TaskDetailsDialog {...props} />);
    await screen.findByText("Texto inicial");
    fireEvent.click(
      screen.getByRole("button", { name: "Adicionar checklist" }),
    );
    fireEvent.change(screen.getByLabelText("Nome da checklist"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar checklist" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("texto válido");
    expect(execute).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Nome da checklist"), {
      target: { value: "Etapas" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar item" }));
    fireEvent.change(screen.getByLabelText("Item 1"), {
      target: { value: "Primeira" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar item" }));
    fireEvent.change(screen.getByLabelText("Item 2"), {
      target: { value: "Segunda" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Mover item 2 para cima" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar checklist" }));
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "save_checklist",
          payload: expect.objectContaining({
            expectedVersion: 0,
            items: [
              expect.objectContaining({ text: "Segunda", completed: false }),
              expect.objectContaining({ text: "Primeira", completed: false }),
            ],
          }),
        }),
      ),
    );
  });
  it("guards closing an active draft and keeps completed cards read only", async () => {
    const { props } = setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const view = render(<TaskDetailsDialog {...props} />);
    await screen.findByText("Texto inicial");
    fireEvent.click(screen.getByRole("button", { name: "Editar título" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Fechar editar tarefa" }),
    );
    expect(confirm).toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    confirm.mockRestore();
    view.unmount();
    render(
      <TaskDetailsDialog
        {...props}
        task={{
          ...task,
          status: "completed",
          completedAt: "2026-11-24T13:00:00Z",
        }}
      />,
    );
    const dialog = within(screen.getByRole("dialog"));
    await dialog.findByText("Texto inicial");
    expect(
      dialog.getByRole("button", { name: "Editar título" }),
    ).toBeDisabled();
    expect(
      dialog.queryByRole("button", { name: "Adicionar checklist" }),
    ).not.toBeInTheDocument();
  });
});
