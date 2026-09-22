import { interpretationSchema, type Interpretation } from "@gabio/contracts";

export type DataSensitivity = "low" | "household" | "private" | "secret";
export type ExternalAiPreference = "never" | "anonymized-only" | "selected";
export type InferenceRoute = "deterministic" | "gemini" | "local" | "manual";

export type SanitizedInferencePayload = Readonly<{
  text: string;
  redactionCount: number;
}>;

export type InferenceRequest = {
  originalText: string;
  sanitizedPayload?: SanitizedInferencePayload;
  sensitivity: DataSensitivity;
  externalAiPreference: ExternalAiPreference;
  deterministicMatch: boolean;
  localAgentAvailable: boolean;
  geminiAvailable: boolean;
};

export type InferenceSelection =
  | { route: "deterministic"; text: string }
  | { route: "local"; text: string }
  | { route: "gemini"; text: string; redactionCount: number }
  | { route: "manual"; text: null };

export interface InferenceProvider {
  readonly id: string;
  interpret(request: { text: string; locale: "pt-BR" }): Promise<unknown>;
}

export function selectInferenceRoute(
  request: InferenceRequest,
): InferenceSelection {
  if (request.deterministicMatch) {
    return { route: "deterministic", text: request.originalText };
  }

  if (request.sensitivity === "secret" || request.sensitivity === "private") {
    return request.localAgentAvailable
      ? { route: "local", text: request.originalText }
      : { route: "manual", text: null };
  }

  if (
    request.externalAiPreference !== "never" &&
    request.geminiAvailable &&
    request.sanitizedPayload
  ) {
    return {
      route: "gemini",
      text: request.sanitizedPayload.text,
      redactionCount: request.sanitizedPayload.redactionCount,
    };
  }

  return request.localAgentAvailable
    ? { route: "local", text: request.originalText }
    : { route: "manual", text: null };
}

export async function interpretWithProvider(
  provider: InferenceProvider,
  selection: Extract<InferenceSelection, { route: "gemini" | "local" }>,
): Promise<Interpretation> {
  const result = await provider.interpret({
    text: selection.text,
    locale: "pt-BR",
  });
  return interpretationSchema.parse(result);
}
