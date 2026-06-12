import { getEnv } from "@/lib/env";

/**
 * Catálogo multi-proveedor de IA (Gemini primario; Groq/OpenAI/OpenRouter como
 * alternativas). Todo vía fetch (sin SDKs) para minimizar dependencias.
 *
 * Dos primitivas:
 *  - `chatCompletion`: texto libre (extracción simple, resúmenes).
 *  - `callWithTool`: tool/function-calling forzado — el LLM SIEMPRE responde
 *    invocando el tool con argumentos estructurados (nada de parsear JSON).
 */

export type ProviderId = "gemini" | "groq" | "openai" | "openrouter";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  defaultModel: string;
  /** Modelo rápido/barato para tareas auxiliares (extracción de PDFs). */
  fastModel: string;
}

export const PROVIDER_CATALOG: Record<ProviderId, ProviderInfo> = {
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    defaultModel: "gemini-2.5-flash",
    fastModel: "gemini-2.5-flash",
  },
  groq: {
    id: "groq",
    label: "Groq",
    defaultModel: "llama-3.3-70b-versatile",
    fastModel: "llama-3.1-8b-instant",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4o",
    fastModel: "gpt-4o-mini",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    defaultModel: "meta-llama/llama-3.3-70b-instruct",
    fastModel: "meta-llama/llama-3.1-8b-instruct",
  },
};

/** Orden de preferencia para fallback automático. */
const FALLBACK_ORDER: ProviderId[] = ["gemini", "groq", "openai", "openrouter"];

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResult {
  text: string;
  usage: TokenUsage;
  provider: ProviderId;
  model: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema de los argumentos del tool. */
  parameters: Record<string, unknown>;
}

export interface ToolCallResult {
  /** Argumentos crudos del tool call (validar con Zod aguas arriba). */
  args: unknown;
  usage: TokenUsage;
  provider: ProviderId;
  model: string;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("Ningún proveedor de IA configurado (falta GEMINI_API_KEY u otra).");
    this.name = "AiNotConfiguredError";
  }
}

function getApiKey(provider: ProviderId): string | undefined {
  const env = getEnv();
  switch (provider) {
    case "gemini":
      return env.GEMINI_API_KEY;
    case "groq":
      return env.GROQ_API_KEY;
    case "openai":
      return env.OPENAI_API_KEY;
    case "openrouter":
      return env.OPENROUTER_API_KEY;
  }
}

/** Proveedores con API key cargada, en orden de preferencia. */
export function availableProviders(): ProviderId[] {
  return FALLBACK_ORDER.filter((p) => Boolean(getApiKey(p)));
}

function resolveProvider(preferred?: ProviderId): ProviderId {
  if (preferred && getApiKey(preferred)) return preferred;
  const available = availableProviders();
  if (available.length === 0) throw new AiNotConfiguredError();
  return available[0];
}

// ────────────────────────────────────────────────────────────────────────────
// Gemini (REST nativo)
// ────────────────────────────────────────────────────────────────────────────

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: { name: string; args: unknown };
      }>;
    };
  }>;
  usageMetadata?: GeminiUsageMetadata;
}

function geminiUsage(meta: GeminiUsageMetadata | undefined): TokenUsage {
  return {
    promptTokens: meta?.promptTokenCount ?? 0,
    completionTokens: meta?.candidatesTokenCount ?? 0,
    totalTokens: meta?.totalTokenCount ?? 0,
  };
}

function toGeminiContents(messages: ChatMessage[]): {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
} {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  return {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents,
  };
}

async function geminiGenerate(
  model: string,
  apiKey: string,
  messages: ChatMessage[],
  tool?: ToolDefinition,
): Promise<GeminiResponse> {
  const { systemInstruction, contents } = toGeminiContents(messages);
  const body: Record<string, unknown> = { contents };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  if (tool) {
    body.tools = [
      {
        functionDeclarations: [
          {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        ],
      },
    ];
    // Forzar que SIEMPRE invoque el tool (nada de texto libre).
    body.toolConfig = {
      functionCallingConfig: { mode: "ANY", allowedFunctionNames: [tool.name] },
    };
  }
  const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Gemini ${model} falló (${res.status}): ${errBody}`);
  }
  return (await res.json()) as GeminiResponse;
}

// ────────────────────────────────────────────────────────────────────────────
// OpenAI-compatible (Groq / OpenAI / OpenRouter)
// ────────────────────────────────────────────────────────────────────────────

const OPENAI_COMPAT_BASE: Record<Exclude<ProviderId, "gemini">, string> = {
  groq: "https://api.groq.com/openai/v1",
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

interface OpenAiCompatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

async function openAiCompatGenerate(
  provider: Exclude<ProviderId, "gemini">,
  model: string,
  apiKey: string,
  messages: ChatMessage[],
  tool?: ToolDefinition,
): Promise<OpenAiCompatResponse> {
  const body: Record<string, unknown> = { model, messages };
  if (tool) {
    body.tools = [
      {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      },
    ];
    body.tool_choice = {
      type: "function",
      function: { name: tool.name },
    };
  }
  const res = await fetch(`${OPENAI_COMPAT_BASE[provider]}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`${provider} ${model} falló (${res.status}): ${errBody}`);
  }
  return (await res.json()) as OpenAiCompatResponse;
}

function openAiUsage(res: OpenAiCompatResponse): TokenUsage {
  return {
    promptTokens: res.usage?.prompt_tokens ?? 0,
    completionTokens: res.usage?.completion_tokens ?? 0,
    totalTokens: res.usage?.total_tokens ?? 0,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// API pública
// ────────────────────────────────────────────────────────────────────────────

export interface AiCallOptions {
  provider?: ProviderId;
  model?: string;
  /** Usar el modelo rápido del proveedor (tareas auxiliares). */
  fast?: boolean;
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: AiCallOptions = {},
): Promise<ChatResult> {
  const provider = resolveProvider(options.provider);
  const info = PROVIDER_CATALOG[provider];
  const model =
    options.model ?? (options.fast ? info.fastModel : info.defaultModel);
  const apiKey = getApiKey(provider);
  if (!apiKey) throw new AiNotConfiguredError();

  if (provider === "gemini") {
    const res = await geminiGenerate(model, apiKey, messages);
    const text =
      res.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("") ?? "";
    return { text, usage: geminiUsage(res.usageMetadata), provider, model };
  }

  const res = await openAiCompatGenerate(provider, model, apiKey, messages);
  return {
    text: res.choices?.[0]?.message?.content ?? "",
    usage: openAiUsage(res),
    provider,
    model,
  };
}

export async function callWithTool(
  messages: ChatMessage[],
  tool: ToolDefinition,
  options: AiCallOptions = {},
): Promise<ToolCallResult> {
  const provider = resolveProvider(options.provider);
  const info = PROVIDER_CATALOG[provider];
  const model =
    options.model ?? (options.fast ? info.fastModel : info.defaultModel);
  const apiKey = getApiKey(provider);
  if (!apiKey) throw new AiNotConfiguredError();

  if (provider === "gemini") {
    const res = await geminiGenerate(model, apiKey, messages, tool);
    const call = res.candidates?.[0]?.content?.parts?.find(
      (p) => p.functionCall,
    )?.functionCall;
    if (!call) {
      throw new Error("Gemini no devolvió un tool call.");
    }
    return {
      args: call.args,
      usage: geminiUsage(res.usageMetadata),
      provider,
      model,
    };
  }

  const res = await openAiCompatGenerate(
    provider,
    model,
    apiKey,
    messages,
    tool,
  );
  const rawArgs =
    res.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!rawArgs) {
    throw new Error(`${provider} no devolvió un tool call.`);
  }
  return {
    args: JSON.parse(rawArgs) as unknown,
    usage: openAiUsage(res),
    provider,
    model,
  };
}
