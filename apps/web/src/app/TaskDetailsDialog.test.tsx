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
  it("includes the empty tag action text in its accessible name", async () => {
    const { props } = setup();
    render(<TaskDetailsDialog {...props} />);
    await screen.findByText("Texto inicial");
    expect(
      screen.getByRole("button", { name: "Tags: Adicionar tag" }),
    ).toHaveTextContent("Adicionar tag");
  });
  it("shows tags and metadata values without repeated visible field labels", async () => {
    const { props } = setup();
    render(
      <TaskDetailsDialog
        {...props}
        task={{ ...task, tags: ["Casa"], assigneeUserId: userId }}
      />,
    );
    await screen.findByText("Texto inicial");
    const metadata = within(
      screen.getByRole("group", { name: "Propriedades do cartão" }),
    );
    expect(
      metadata.getByRole("button", { name: "Tags Casa" }),
    ).toHaveTextContent("Casa");
    expect(
      metadata.getByRole("button", { name: "Responsável Pessoa A" }),
    ).toHaveTextContent("Pessoa A");
    for (const label of [
      "Tags",
      "Responsável",
      "Prioridade",
      "Prazo",
      "Recorrência",
    ])
      expect(
        metadata.queryByText(label, { exact: true }),
      ).not.toBeInTheDocument();
    fireEvent.click(metadata.getByRole("button", { name: "Tags Casa" }));
    expect(
      screen.getByRole("dialog", { name: "Editar tags" }),
    ).toBeInTheDocument();
  });
  it("saves only priority and retains the version captured before a refresh", async () => {
    const { props } = setup();
    const view = render(<TaskDetailsDialog {...props} />);
    await screen.findByText("Texto inicial");
    fireEvent.click(screen.getByRole("button", { name: /^Prioridade/ }));
    const editor = within(
      screen.getByRole("dialog", { name: "Editar prioridade" }),
    );
    expect(editor.getByLabelText("Prioridade")).toHaveValue("medium");
    fireEvent.change(editor.getByLabelText("Prioridade"), {
      target: { value: "high" },
    });
    view.rerender(
      <TaskDetailsDialog
        {...props}
        task={{ ...task, version: 2, priority: "low" }}
      />,
    );
    fireEvent.click(editor.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(props.onUpdate).toHaveBeenCalledWith({ priority: "high" }, 1),
    );
  });
  it("protects tag chip removal when cancelling the modal", async () => {
    const { props } = setup();
    render(<TaskDetailsDialog {...props} task={{ ...task, tags: ["Casa"] }} />);
    await screen.findByText("Texto inicial");
    fireEvent.click(screen.getByRole("button", { name: /^Tags/ }));
    const editor = within(screen.getByRole("dialog", { name: "Editar tags" }));
    fireEvent.click(editor.getByRole("button", { name: "Remover tag Casa" }));
    fireEvent.click(editor.getByRole("button", { name: "Cancelar" }));
    expect(
      screen.getByRole("dialog", { name: "Descartar alterações?" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(
      screen.queryByRole("button", { name: "Remover tag Casa" }),
    ).not.toBeInTheDocument();
    expect(props.onUpdate).not.toHaveBeenCalled();
  });
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
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
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
    const view = render(<TaskDetailsDialog {...props} />);
    await screen.findByText("Texto inicial");
    fireEvent.click(screen.getByRole("button", { name: "Editar título" }));
    const titleDialog = screen.getByRole("dialog", { name: "Editar título" });
    fireEvent.change(
      within(titleDialog).getByRole("textbox", { name: "Título" }),
      { target: { value: "Rascunho preservado" } },
    );
    fireEvent.click(
      within(titleDialog).getByRole("button", { name: "Fechar editar título" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Descartar alterações?" }),
    ).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(screen.getByRole("textbox", { name: "Título" })).toHaveValue(
      "Rascunho preservado",
    );
    fireEvent(
      titleDialog,
      new Event("cancel", { bubbles: true, cancelable: true }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Descartar alterações" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Editar título" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Editar tarefa" }),
    ).toBeInTheDocument();
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
  it.each([
    [/^Prioridade/, "Editar prioridade", "Prioridade"],
    [/^Prazo/, "Agendamento", "Prazo"],
    [/^Recorrência/, "Agendamento", "Repetir"],
    [/^Responsável/, "Editar responsável", "Responsável"],
    [/^Tags/, "Editar tags", "Buscar ou criar tag"],
    [/^Mais opções/, "Visibilidade do cartão", "Quem pode ver"],
  ] as const)(
    "opens property %s in a separate dialog",
    async (trigger, title, label) => {
      const { props } = setup();
      render(<TaskDetailsDialog {...props} />);
      await screen.findByText("Texto inicial");
      const card = screen.getByRole("dialog", { name: "Editar tarefa" });
      fireEvent.click(within(card).getByRole("button", { name: trigger }));
      const editor = screen.getByRole("dialog", { name: title });
      expect(card.querySelector("form")).toBeNull();
      expect(card.contains(editor)).toBe(false);
      expect(within(editor).getByLabelText(label)).toBeInTheDocument();
      fireEvent.click(within(editor).getByRole("button", { name: "Cancelar" }));
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: title }),
        ).not.toBeInTheDocument(),
      );
      expect(props.onUpdate).not.toHaveBeenCalled();
      expect(props.onClose).not.toHaveBeenCalled();
    },
  );
});
