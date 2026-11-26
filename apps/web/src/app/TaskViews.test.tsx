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
  it("navigates seven-day weeks across years and preserves the selected day in month view", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T15:00:00Z"));
    const onOpenTask = vi.fn();
    try {
      render(
        <TaskViews
          tasks={Array.from({ length: 3 }, (_, i) => ({
            ...tasks[0]!,
            id: `30000000-0000-4000-8000-00000000000${i + 1}`,
            title: `Atividade fictícia ${i + 1}`,
            dueAt: "2026-12-31T12:00:00Z",
          }))}
          renderTask={(t) => <article key={t.id}>{t.title}</article>}
          gateway={{} as AppGateway}
          household={house}
          userId={userId}
          catalog={[]}
          onTagsChanged={async () => {}}
          onOpenTask={onOpenTask}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Semana" }));
      expect(document.querySelectorAll(".calendar-day")).toHaveLength(7);
      expect(document.querySelectorAll(".calendar-event")).toHaveLength(3);
      expect(
        screen.getByRole("button", {
          name: /segunda-feira, 28 de dezembro de 2026/,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /domingo, 3 de janeiro de 2027/ }),
      ).toBeInTheDocument();
      fireEvent.click(
        document.querySelector<HTMLButtonElement>(".calendar-event")!,
      );
      expect(onOpenTask).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Atividade fictícia 1" }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Próxima semana" }));
      expect(
        screen.getByRole("button", {
          name: /segunda-feira, 4 de janeiro de 2027/,
        }),
      ).toBeInTheDocument();
      expect(document.querySelectorAll(".calendar-event")).toHaveLength(0);
      fireEvent.click(screen.getByRole("button", { name: "Semana anterior" }));
      expect(document.querySelectorAll(".calendar-event")).toHaveLength(3);
      fireEvent.click(screen.getByRole("button", { name: "Mês" }));
      expect(document.querySelectorAll(".calendar-day")).toHaveLength(42);
      expect(
        screen.getByRole("button", {
          name: /quinta-feira, 31 de dezembro de 2026/,
        }),
      ).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
      fireEvent.click(screen.getByRole("button", { name: "Hoje" }));
      expect(
        screen.getByRole("button", {
          name: /quinta-feira, 31 de dezembro de 2026/,
        }),
      ).toHaveAttribute("aria-pressed", "true");
    } finally {
      vi.useRealTimers();
    }
  });

  it("automatically retries a rate-limited continuation using the same cursor", async () => {
    vi.useFakeTimers();
    const page = {
      state: "connected",
      generation: "50000000-0000-4000-8000-000000000001",
      checkedAt: "2026-11-24T12:00:00Z",
      tasksState: "ok",
      calendarState: "ok",
      sources: [],
      items: [],
      continuation: "synthetic-cursor",
    };
    const readGoogleItems = vi
      .fn()
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce({
        ...page,
        state: "rate_limited",
        continuation: null,
      })
      .mockResolvedValue({ ...page, continuation: null });
    try {
      await act(async () => {
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
      });
      fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "Carregar mais itens Google" }),
        );
      });
      expect(readGoogleItems).toHaveBeenCalledTimes(2);
      expect(
        screen.getByRole("button", { name: "Carregar mais itens Google" }),
      ).toBeDisabled();
      await act(async () => {
        vi.advanceTimersByTime(65_000);
      });
      expect(readGoogleItems).toHaveBeenCalledTimes(3);
      expect(readGoogleItems.mock.calls[1]?.[1]).toBe("synthetic-cursor");
      expect(readGoogleItems.mock.calls[2]?.[1]).toBe("synthetic-cursor");
      expect(
        screen.queryByRole("button", { name: "Carregar mais itens Google" }),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
  it("recovers a reading cooldown automatically without an attention alert or repeated manual requests", async () => {
    vi.useFakeTimers();
    const snapshot = {
      state: "rate_limited",
      generation: "50000000-0000-4000-8000-000000000001",
      checkedAt: "2026-11-24T12:00:00Z",
      tasksState: "ok",
      calendarState: "ok",
      sources: [],
      items: [],
    };
    const readGoogleItems = vi
      .fn()
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValue({ ...snapshot, state: "connected" });
    try {
      await act(async () => {
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
      });
      expect(
        screen.queryByRole("button", { name: /Google precisa de atenção/ }),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));
      expect(
        screen.getByText(/A leitura do Google será retomada automaticamente/),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Atualizar Google" }),
      ).toBeDisabled();
      await act(async () => {
        vi.advanceTimersByTime(65_000);
      });
      expect(readGoogleItems).toHaveBeenCalledTimes(2);
      // A second refusal can be the daily budget: return to the normal interval.
      await act(async () => {
        vi.advanceTimersByTime(65_000);
      });
      expect(readGoogleItems).toHaveBeenCalledTimes(2);
      await act(async () => {
        vi.advanceTimersByTime(15 * 60_000 - 65_000);
      });
      expect(readGoogleItems).toHaveBeenCalledTimes(3);
      expect(
        screen.getByRole("button", { name: "Atualizar Google" }),
      ).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });
  it("discards an in-flight Google read and schedules automatic recovery after synchronization changes", async () => {
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
      screen.queryByRole("button", { name: /Atualizar leitura Google/ }),
    ).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Mês" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Quadro" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Mês" }));
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
