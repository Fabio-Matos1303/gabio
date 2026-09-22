import { describe, expect, it, vi } from "vitest";

import { interpretWithProvider, selectInferenceRoute } from "./index.js";

const baseRequest = {
  originalText: "Crie uma tarefa para Fábio amanhã",
  sanitizedPayload: {
    text: "Crie uma tarefa para [PESSOA] amanhã",
    redactionCount: 1,
  },
  sensitivity: "low" as const,
  externalAiPreference: "anonymized-only" as const,
  deterministicMatch: false,
  localAgentAvailable: true,
  geminiAvailable: true,
};

describe("selectInferenceRoute", () => {
  it("never sends private content to Gemini", () => {
    expect(
      selectInferenceRoute({ ...baseRequest, sensitivity: "private" }),
    ).toEqual({
      route: "local",
      text: baseRequest.originalText,
    });
  });

  it("gives Gemini only the sanitized payload", async () => {
    const selection = selectInferenceRoute(baseRequest);
    expect(selection).toEqual({
      route: "gemini",
      text: baseRequest.sanitizedPayload.text,
      redactionCount: 1,
    });

    if (selection.route !== "gemini") throw new Error("unexpected route");
    const interpret = vi.fn().mockResolvedValue({
      proposal: null,
      confidence: 0.4,
      missingFields: [],
      clarificationQuestion: "Quando?",
    });

    await interpretWithProvider({ id: "test", interpret }, selection);
    expect(interpret).toHaveBeenCalledWith({
      text: "Crie uma tarefa para [PESSOA] amanhã",
      locale: "pt-BR",
    });
    expect(interpret).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("Fábio") }),
    );
  });

  it("uses local inference without a sanitized external payload", () => {
    const {
      sanitizedPayload: _sanitizedPayload,
      ...requestWithoutSanitization
    } = baseRequest;
    expect(selectInferenceRoute(requestWithoutSanitization)).toEqual({
      route: "local",
      text: baseRequest.originalText,
    });
  });

  it("falls back to manual processing when private and local is unavailable", () => {
    expect(
      selectInferenceRoute({
        ...baseRequest,
        sensitivity: "private",
        localAgentAvailable: false,
      }),
    ).toEqual({ route: "manual", text: null });
  });

  it("rejects malformed provider output at runtime", async () => {
    const provider = {
      id: "invalid",
      interpret: vi.fn().mockResolvedValue({ confidence: 99 }),
    };

    await expect(
      interpretWithProvider(provider, { route: "local", text: "texto" }),
    ).rejects.toThrow();
  });
});
