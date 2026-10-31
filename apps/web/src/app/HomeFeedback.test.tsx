import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AppGateway } from "../lib/app-gateway.js";
import { HomeCalendar } from "./HomeCalendar.js";
import { HomeInsights } from "./HomeInsights.js";

describe("home data feedback", () => {
  it.each([
    {
      Component: HomeInsights,
      loading: "Carregando indicadores…",
      failure: "Não foi possível carregar os indicadores da casa.",
      result: "Nenhuma tarefa cadastrada.",
    },
    {
      Component: HomeCalendar,
      loading: "Carregando agenda…",
      failure: "Não foi possível carregar o planejamento mensal.",
      result: "Dia livre",
    },
  ])(
    "does not present empty results while $loading or after failure",
    async ({ Component, loading, failure, result }) => {
      let reject!: (reason: Error) => void;
      const pending = new Promise<never>((_, fail) => {
        reject = fail;
      });
      const gateway = {
        listTasks: vi.fn(() => pending),
        loadFinance: vi.fn().mockResolvedValue({
          accounts: [],
          categories: [],
          transactions: [],
          budgets: [],
          recurrences: [],
        }),
        listCalendarEvents: vi.fn().mockResolvedValue([]),
      } as unknown as AppGateway;

      render(<Component gateway={gateway} />);
      expect(screen.getByRole("status")).toHaveTextContent(loading);
      expect(screen.queryByText(result)).not.toBeInTheDocument();
      expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
      await act(async () => reject(new Error("Synthetic network failure")));
      expect(await screen.findByRole("alert")).toHaveTextContent(failure);
      expect(screen.queryByText(result)).not.toBeInTheDocument();
      expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    },
  );
});
