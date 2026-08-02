import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

/**
 * Catálogo multi-proveedor de IA (Gemini primario; Groq/OpenAI/OpenRouter como
 * alternativas). Todo vía fetch (sin SDKs) para minimizar dependencias.
 *
 * Dos primitivas:
 *  - `chatCompletion`: texto libre (extracción simple, resúmenes).
 *  - `callWithTool`: tool/function-calling forzado — el LLM SIEMPRE responde
 *    invocando el tool con argumentos estructurados (nada de parsear JSON).
 */

export type ProviderId =
  | "gemini"
  | "groq"
  | "mistral"
  | "cerebras"
  | "openai"
  | "openrouter";

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
  mistral: {
    id: "mistral",
    label: "Mistral",
    defaultModel: "mistral-large-latest",
    fastModel: "mistral-small-latest",
  },
  cerebras: {
    id: "cerebras",
    label: "Cerebras",
    defaultModel: "llama-3.3-70b",
    fastModel: "llama3.1-8b",
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
const FALLBACK_ORDER: ProviderId[] = [
  "gemini",
  "groq",
  "mistral",
  "cerebras",
  "openai",
  "openrouter",
];

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
    case "mistral":
      return env.MISTRAL_API_KEY;
    case "cerebras":
      return env.CEREBRAS_API_KEY;
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

export function isProviderId(value: string): value is ProviderId {
  return (FALLBACK_ORDER as string[]).includes(value);
}

/**
 * Proveedores disponibles para un tenant: intersección entre los que tienen
 * API key cargada (`availableProviders()`) y los habilitados en
 * `TenantAiConfig.enabledProviders`. Lista vacía en `enabledProviders`
 * significa "todos habilitados" (default cuando el tenant no configuró nada).
 */
export async function availableProvidersForTenant(
  tenantId: string,
): Promise<ProviderId[]> {
  const available = availableProviders();
  const config = await prisma.tenantAiConfig.findUnique({
    where: { tenantId },
    select: { enabledProviders: true },
  });
  const enabled = config?.enabledProviders ?? [];
  if (enabled.length === 0) return available;
  const enabledSet = new Set(enabled.filter(isProviderId));
  return available.filter((p) => enabledSet.has(p));
}

function resolveProvider(
  preferred?: ProviderId,
  pool: ProviderId[] = availableProviders(),
): ProviderId {
  if (preferred && pool.includes(preferred) && getApiKey(preferred)) {
    return preferred;
  }
  if (pool.length === 0) throw new AiNotConfiguredError();
  return pool[0];
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
  mistral: "https://api.mistral.ai/v1",
  cerebras: "https://api.cerebras.ai/v1",
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
  /**
   * Pool restringido de proveedores a considerar (p.ej. resultado de
   * `availableProvidersForTenant`). Si no se pasa, se usa
   * `availableProviders()` (todos los configurados globalmente).
   */
  allowedProviders?: ProviderId[];
}

/**
 * Se lanza cuando se agotó la rotación de proveedores disponibles y todos
 * fallaron. Incluye el detalle de cada intento para poder diagnosticar en
 * logs (cuota, timeout, contexto demasiado grande, etc.).
 */
export class AllProvidersFailedError extends Error {
  constructor(public readonly attempts: Array<{ provider: ProviderId; error: unknown }>) {
    const detalle = attempts
      .map(
        (a) =>
          `${a.provider}: ${a.error instanceof Error ? a.error.message : String(a.error)}`,
      )
      .join(" | ");
    super(
      `Todos los proveedores de IA disponibles fallaron (${attempts
        .map((a) => a.provider)
        .join(", ")}). Detalle: ${detalle}`,
    );
    this.name = "AllProvidersFailedError";
  }
}

/**
 * Orden de intento para una llamada: el proveedor preferido/resuelto primero,
 * seguido del resto del pool sin repetirlo (fallback automático ante
 * 429/503/timeout/error de red de un proveedor).
 */
function resolveAttemptOrder(
  preferred: ProviderId | undefined,
  pool: ProviderId[],
): ProviderId[] {
  const first = resolveProvider(preferred, pool);
  const rest = pool.filter((p) => p !== first);
  return [first, ...rest];
}

async function chatCompletionOnce(
  provider: ProviderId,
  messages: ChatMessage[],
  options: AiCallOptions,
): Promise<ChatResult> {
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

async function callWithToolOnce(
  provider: ProviderId,
  messages: ChatMessage[],
  tool: ToolDefinition,
  options: AiCallOptions,
): Promise<ToolCallResult> {
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

/**
 * Genera texto con fallback automático: si el proveedor preferido falla
 * (cuota, 503, timeout, red), reintenta con el siguiente proveedor disponible
 * del pool hasta agotarlo. Lanza `AllProvidersFailedError` si todos fallan.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: AiCallOptions = {},
): Promise<ChatResult> {
  const pool = options.allowedProviders ?? availableProviders();
  const order = resolveAttemptOrder(options.provider, pool);
  const attempts: Array<{ provider: ProviderId; error: unknown }> = [];

  for (const provider of order) {
    try {
      return await chatCompletionOnce(provider, messages, options);
    } catch (err) {
      console.warn(
        `chatCompletion: proveedor "${provider}" falló, probando siguiente del pool si hay.`,
        err,
      );
      attempts.push({ provider, error: err });
    }
  }
  throw new AllProvidersFailedError(attempts);
}

/**
 * Igual que `chatCompletion` pero forzando tool-calling, con el mismo
 * fallback automático entre proveedores ante error.
 */
export async function callWithTool(
  messages: ChatMessage[],
  tool: ToolDefinition,
  options: AiCallOptions = {},
): Promise<ToolCallResult> {
  const pool = options.allowedProviders ?? availableProviders();
  const order = resolveAttemptOrder(options.provider, pool);
  const attempts: Array<{ provider: ProviderId; error: unknown }> = [];

  for (const provider of order) {
    try {
      return await callWithToolOnce(provider, messages, tool, options);
    } catch (err) {
      console.warn(
        `callWithTool: proveedor "${provider}" falló, probando siguiente del pool si hay.`,
        err,
      );
      attempts.push({ provider, error: err });
    }
  }
  throw new AllProvidersFailedError(attempts);
}

// ────────────────────────────────────────────────────────────────────────────
// Panel de salud de proveedores
// ────────────────────────────────────────────────────────────────────────────

export interface ProviderHealth {
  provider: ProviderId;
  status: "configured" | "not-configured";
}

/**
 * Chequeo liviano: solo confirma si hay API key cargada para el proveedor.
 * NO hace ninguna llamada de red — pensado para mostrarse automáticamente en
 * el panel de configuración sin gastar cuota de los proveedores.
 */
export function checkProviderHealth(provider: ProviderId): ProviderHealth {
  return {
    provider,
    status: getApiKey(provider) ? "configured" : "not-configured",
  };
}

/** Health-check de todos los proveedores del catálogo (sin llamadas de red). */
export function checkAllProvidersHealth(): ProviderHealth[] {
  return FALLBACK_ORDER.map((p) => checkProviderHealth(p));
}

export interface ProviderPingResult {
  provider: ProviderId;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * Hace una llamada real mínima al proveedor para confirmar conectividad.
 * SOLO debe dispararse a demanda explícita del usuario (botón "Probar
 * conexión"), nunca automáticamente — consume cuota real del proveedor.
 */
export async function pingProvider(
  provider: ProviderId,
): Promise<ProviderPingResult> {
  const apiKey = getApiKey(provider);
  if (!apiKey) {
    return { provider, ok: false, latencyMs: 0, error: "Sin API key configurada." };
  }
  const info = PROVIDER_CATALOG[provider];
  const started = Date.now();
  try {
    if (provider === "gemini") {
      await geminiGenerate(info.fastModel, apiKey, [
        { role: "user", content: "ping" },
      ]);
    } else {
      await openAiCompatGenerate(provider, info.fastModel, apiKey, [
        { role: "user", content: "ping" },
      ]);
    }
    return { provider, ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      provider,
      ok: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : "Error desconocido.",
    };
  }
}
