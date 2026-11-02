import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { taskSchema } from "@gabio/contracts";
import { StrictMode } from "react";
import { TaskViews } from "./TaskViews.js";
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
    render(
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
      screen.getByRole("region", { name: "Editar tags locais" }),
    ).toBeInTheDocument();
    expect(readGoogleItems).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Atualizar Google" }));
    // The new generation removes the stale form before it can be submitted.
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Editar tags locais" }),
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
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "cozinha" },
    });
    expect(screen.queryByText("Comprar materiais")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Calendário" }));
    expect(screen.getByRole("searchbox")).toHaveValue("cozinha");
    const calendar = screen.getByRole("region", {
      name: "Calendário de tarefas",
    });
    expect(within(calendar).getAllByRole("button").length).toBe(45);
    fireEvent.click(screen.getByText("Sem data ou prazo (1)"));
    expect(within(calendar).getByText("Limpar cozinha")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Kanban" }));
    expect(screen.queryByText("Comprar materiais")).toBeNull();
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
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Suas tarefas Gabio continuam disponíveis",
    );
    expect(screen.getByText("Limpar cozinha")).toBeInTheDocument();
  });
});
