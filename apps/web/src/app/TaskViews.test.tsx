import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
  act,
} from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { taskSchema } from "@gabio/contracts";
import { StrictMode } from "react";
import { TaskViews } from "./TaskViews.js";
import { GOOGLE_PROJECTIONS_CHANGED_EVENT } from "../lib/google-calendar.js";
import type { AppGateway, HouseholdContext } from "../lib/app-gateway.js";
const userId = "10000000-0000-4000-8000-000000000001";
const house: HouseholdContext = {
  id: "20000000-0000-4000-8000-000000000001",
  name: "Casa fictícia",
  role: "owner",
  members: [{ userId, displayName: "Pessoa fictícia", role: "owner" }],
};
const tasks = ["Limpar cozinha", "Comprar materiais"].map((title, i) =>
  taskSchema.parse({
    id: `30000000-0000-4000-8000-00000000000${i + 1}`,
    householdId: house.id,
    ownerUserId: userId,
    createdBy: userId,
    assigneeUserId: null,
    title,
    dueAt: null,
    visibility: "household",
    recurrence: "none",
    status: "open",
    completedAt: null,
    version: 1,
    createdAt: "2026-11-02T12:00:00Z",
    updatedAt: "2026-11-02T12:00:00Z",
    tags: i ? ["Compras"] : ["Casa"],
  }),
);
describe("TaskViews", () => {
  it("discards an in-flight Google read after synchronization changes without automatic polling", async () => {
    let resolve!: (value: unknown) => void;
    const readGoogleItems = vi.fn().mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    render(
      <TaskViews
        tasks={tasks}
        renderTask={(t) => <article key={t.id}>{t.title}</article>}
        gateway={{ readGoogleItems } as unknown as AppGateway}
        household={house}
        userId={userId}
        catalog={[]}
        onTagsChanged={async () => {}}
      />,
    );
    await waitFor(() => expect(readGoogleItems).toHaveBeenCalledTimes(1));
    act(() =>
      window.dispatchEvent(new Event(GOOGLE_PROJECTIONS_CHANGED_EVENT)),
    );
    await act(async () =>
      resolve({
        state: "connected",
        generation: "50000000-0000-4000-8000-000000000001",
        checkedAt: "2026-11-03T12:00:00Z",
        tasksState: "ok",
        calendarState: "ok",
        sources: [],
        items: [],
      }),
    );
    expect(
      screen.getByRole("button", { name: /Atualizar leitura Google/ }),
    ).toBeInTheDocument();
    expect(readGoogleItems).toHaveBeenCalledTimes(1);
  });
  it("orders by nearest deadline and shows filtered counts per task phase without a total", () => {
    render(
      <TaskViews
        tasks={[
          { ...tasks[0]!, dueAt: "2026-11-10T12:00:00Z" },
          { ...tasks[1]!, dueAt: "2026-11-04T12:00:00Z" },
          {
            ...tasks[0]!,
            id: "30000000-0000-4000-8000-000000000003",
            status: "in_progress",
            title: "Preparar materiais",
          },
          {
            ...tasks[1]!,
            id: "30000000-0000-4000-8000-000000000004",
            status: "completed",
            title: "Revisar materiais",
            dueAt: "2026-11-01T12:00:00Z",
            completedAt: "2026-11-02T12:00:00Z",
            updatedAt: "2026-11-05T12:00:00Z",
          },
          {
            ...tasks[0]!,
            id: "30000000-0000-4000-8000-000000000005",
            status: "completed",
            title: "Organizar materiais",
            dueAt: null,
            completedAt: "2026-11-03T12:00:00Z",
          },
        ]}
        renderTask={(t) => <article key={t.id}>{t.title}</article>}
        gateway={{} as AppGateway}
        household={house}
        userId={userId}
        catalog={[]}
        onTagsChanged={async () => {}}
      />,
    );
    expect(
      within(screen.getByRole("region", { name: "A fazer" }))
        .getAllByRole("article")
        .map((item) => item.textContent),
    ).toEqual(["Comprar materiais", "Limpar cozinha"]);
    expect(screen.getByLabelText("2 tarefas em A fazer")).toHaveTextContent(
      "2",
    );
    expect(screen.getByLabelText("1 tarefa em Em andamento")).toHaveTextContent(
      "1",
    );
    expect(screen.getByLabelText("2 tarefas em Concluídas")).toHaveTextContent(
      "2",
    );
    expect(
      within(screen.getByRole("region", { name: "Concluídas" }))
        .getAllByRole("article")
        .map((item) => item.textContent),
    ).toEqual(["Organizar materiais", "Revisar materiais"]);
    fireEvent.click(screen.getByRole("button", { name: "Ordenar tarefas" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Ordenar" }), {
      target: { value: "updated_desc" },
    });
    expect(
      within(screen.getByRole("region", { name: "Concluídas" }))
        .getAllByRole("article")
        .map((item) => item.textContent),
    ).toEqual(["Revisar materiais", "Organizar materiais"]);
    fireEvent.click(screen.getByRole("button", { name: "Concluído" }));
    expect(screen.queryByText(/tarefa\(s\)/)).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Buscar tarefas e eventos" }),
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "materiais" },
    });
    expect(screen.getByLabelText("1 tarefa em A fazer")).toHaveTextContent("1");
  });
  it("deduplicates StrictMode reads and closes old account editors after generation changes", async () => {
    const generationA = "50000000-0000-4000-8000-000000000001",
      generationB = "50000000-0000-4000-8000-000000000002";
    const snapshot = {
      state: "connected",
      generation: generationA,
      checkedAt: "2026-11-02T12:00:00Z",
      tasksState: "ok",
      calendarState: "ok",
      sources: [],
      items: [
        {
          id: "external",
          remoteId: "remote",
          source: "google_tasks",
          sourceId: "list",
          sourceName: "Fictícia",
          title: "Tarefa externa fictícia",
          status: "open",
          date: null,
          startsAt: null,
          endsAt: null,
          endDate: null,
          url: null,
          updatedAt: null,
          tags: [],
        },
      ],
    };
    const readGoogleItems = vi
      .fn()
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce({
        ...snapshot,
        generation: generationB,
        items: [],
      });
    const saveExternalTaskTags = vi.fn();
    const gateway = {
      readGoogleItems,
      saveExternalTaskTags,
    } as unknown as AppGateway;
    const { rerender } = render(
      <StrictMode>
        <TaskViews
          tasks={tasks}
          renderTask={(t) => <article key={t.id}>{t.title}</article>}
          gateway={gateway}
          household={house}
          userId={userId}
          catalog={[]}
          onTagsChanged={async () => {}}
        />
      </StrictMode>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Editar tags locais" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Editar tags locais" }),
    ).toBeInTheDocument();
    expect(readGoogleItems).toHaveBeenCalledTimes(1);
    rerender(
      <StrictMode>
        <TaskViews
          tasks={tasks}
          renderTask={(t) => <article key={t.id}>{t.title}</article>}
          gateway={{ ...gateway }}
          household={house}
          userId={userId}
          catalog={[]}
          onTagsChanged={async () => {}}
        />
      </StrictMode>,
    );
    // The new generation removes the stale form before it can be submitted.
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Editar tags locais" }),
      ).toBeNull(),
    );
    expect(saveExternalTaskTags).not.toHaveBeenCalled();
  });
  it("preserves filters while changing views and keeps undated tasks reachable", () => {
    render(
      <TaskViews
        tasks={tasks}
        renderTask={(t) => <article key={t.id}>{t.title}</article>}
        gateway={{} as AppGateway}
        household={house}
        userId={userId}
        catalog={[]}
        onTagsChanged={async () => {}}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Buscar tarefas e eventos" }),
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "cozinha" },
    });
    expect(screen.queryByText("Comprar materiais")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar resultados" }));
    fireEvent.click(screen.getByRole("button", { name: "Calendário" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Buscar tarefas e eventos" }),
    );
    expect(screen.getByRole("searchbox")).toHaveValue("cozinha");
    fireEvent.click(screen.getByRole("button", { name: "Mostrar resultados" }));
    const calendar = screen.getByRole("region", {
      name: "Calendário de tarefas",
    });
    expect(within(calendar).getAllByRole("button").length).toBe(45);
    fireEvent.click(screen.getByText("Sem data ou prazo (1)"));
    expect(within(calendar).getByText("Limpar cozinha")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Kanban" }));
    expect(screen.queryByText("Comprar materiais")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getByText("Comprar materiais")).toBeInTheDocument();
  });
  it("shows Google failure without hiding local tasks", async () => {
    render(
      <TaskViews
        tasks={tasks}
        renderTask={(t) => <article key={t.id}>{t.title}</article>}
        gateway={
          {
            readGoogleItems: vi.fn().mockRejectedValue(new Error("synthetic")),
          } as unknown as AppGateway
        }
        household={house}
        userId={userId}
        catalog={[]}
        onTagsChanged={async () => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Suas tarefas Gabio continuam disponíveis",
    );
    expect(screen.getByText("Limpar cozinha")).toBeInTheDocument();
  });
  it("keeps tag selections when switching match mode and preserves sort when clearing filters", () => {
    render(
      <TaskViews
        tasks={tasks}
        renderTask={(t) => <article key={t.id}>{t.title}</article>}
        gateway={{} as AppGateway}
        household={house}
        userId={userId}
        catalog={[]}
        onTagsChanged={async () => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ordenar tarefas" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Ordenar" }), {
      target: { value: "title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Concluído" }));
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    const panel = within(
      screen.getByRole("dialog", { name: "Filtrar tarefas e eventos" }),
    );
    fireEvent.click(panel.getByRole("checkbox", { name: "Casa" }));
    fireEvent.change(panel.getByRole("combobox", { name: "Correspondência" }), {
      target: { value: "all" },
    });
    expect(panel.getByRole("checkbox", { name: "Casa" })).toBeChecked();
    fireEvent.click(panel.getByRole("button", { name: /Mostrar 1 resultado/ }));
    expect(screen.queryByText("Comprar materiais")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Remover filtro Tag: Casa" }),
    );
    expect(screen.getByText("Comprar materiais")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Mostrar .* resultado/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Ordenar tarefas" }));
    expect(screen.getByRole("combobox", { name: "Ordenar" })).toHaveValue(
      "title",
    );
  });

  it("disables calendar previews when the task cannot be opened", () => {
    const dueAt = new Date().toISOString();
    render(
      <TaskViews
        tasks={[{ ...tasks[0]!, dueAt }]}
        renderTask={(t) => <article key={t.id}>{t.title}</article>}
        gateway={{} as AppGateway}
        household={house}
        userId={userId}
        catalog={[]}
        onTagsChanged={async () => {}}
        onOpenTask={vi.fn()}
        canOpenTask={() => false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Calendário" }));
    const preview =
      document.querySelector<HTMLButtonElement>(".calendar-event");
    expect(preview).not.toBeNull();
    expect(preview).toBeDisabled();
  });
  it("requires a separate confirmation before deleting a catalog tag", async () => {
    const executeTagCommand = vi.fn().mockResolvedValue({});
    render(
      <TaskViews
        tasks={tasks}
        renderTask={(t) => <article key={t.id}>{t.title}</article>}
        gateway={{ executeTagCommand } as unknown as AppGateway}
        household={house}
        userId={userId}
        catalog={[
          {
            id: "80000000-0000-4000-8000-000000000001",
            name: "Casa",
            visibility: "household",
            version: 3,
          },
        ]}
        onTagsChanged={async () => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));
    fireEvent.click(screen.getByRole("button", { name: "Gerenciar tags" }));
    const manager = within(
      screen.getByRole("dialog", { name: "Gerenciar tags" }),
    );
    fireEvent.click(
      manager.getByRole("button", { name: "Editar tag Casa · Da casa" }),
    );
    fireEvent.click(manager.getByRole("button", { name: "Excluir tag" }));
    expect(executeTagCommand).not.toHaveBeenCalled();
    expect(manager.getByRole("alert")).toHaveTextContent(
      "As tarefas serão mantidas",
    );
    fireEvent.click(
      manager.getByRole("button", { name: "Confirmar exclusão da tag" }),
    );
    await waitFor(() =>
      expect(executeTagCommand).toHaveBeenCalledWith(
        expect.objectContaining({ type: "delete", expectedVersion: 3 }),
      ),
    );
  });
  it("keeps tools compact until their modal is requested", () => {
    render(
      <TaskViews
        tasks={tasks}
        renderTask={(t) => <article key={t.id}>{t.title}</article>}
        gateway={{} as AppGateway}
        household={house}
        userId={userId}
        catalog={[]}
        onTagsChanged={async () => {}}
      />,
    );
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Hoje" })).toBeNull();
    expect(screen.getByText("Limpar cozinha")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Buscar tarefas e eventos" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Buscar tarefas e eventos" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveFocus();
  });
});
