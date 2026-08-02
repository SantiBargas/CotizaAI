import { getEnv } from "@/lib/env";

/**
 * Embeddings 768D para RAG vectorial.
 * Default: Gemini `gemini-embedding-001` con outputDimensionality=768.
 * Alternativa: OpenAI `text-embedding-3-small` con dimensions=768 (misma
 * dimensión → la columna vector(768) sirve para ambos; NO mezclar proveedores
 * dentro de un mismo tenant sin reindexar).
 */

export const EMBEDDING_DIMENSIONS = 768;

export class EmbeddingsNotConfiguredError extends Error {
  constructor() {
    super("Embeddings no configurados (falta GEMINI_API_KEY u OPENAI_API_KEY).");
    this.name = "EmbeddingsNotConfiguredError";
  }
}

export interface EmbeddingResult {
  embedding: number[];
  provider: "gemini" | "openai";
  model: string;
}

async function embedGemini(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: EMBEDDING_DIMENSIONS,
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini embeddings falló (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { embedding?: { values?: number[] } };
  const values = json.embedding?.values;
  if (!values || values.length === 0) {
    throw new Error("Gemini embeddings devolvió un vector vacío.");
  }
  return values;
}

async function embedOpenAi(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI embeddings falló (${res.status}): ${body}`);
  }
  const json = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const values = json.data?.[0]?.embedding;
  if (!values || values.length === 0) {
    throw new Error("OpenAI embeddings devolvió un vector vacío.");
  }
  return values;
}

/** Genera el embedding de un texto. Lanza si no hay proveedor configurado. */
export async function embedText(text: string): Promise<EmbeddingResult> {
  const env = getEnv();
  const preferred = env.EMBEDDING_PROVIDER;

  if (preferred === "gemini" && env.GEMINI_API_KEY) {
    return {
      embedding: await embedGemini(text, env.GEMINI_API_KEY),
      provider: "gemini",
      model: "gemini-embedding-001",
    };
  }
  if (env.OPENAI_API_KEY) {
    return {
      embedding: await embedOpenAi(text, env.OPENAI_API_KEY),
      provider: "openai",
      model: "text-embedding-3-small",
    };
  }
  if (env.GEMINI_API_KEY) {
    return {
      embedding: await embedGemini(text, env.GEMINI_API_KEY),
      provider: "gemini",
      model: "gemini-embedding-001",
    };
  }
  throw new EmbeddingsNotConfiguredError();
}

/** True si hay algún proveedor de embeddings configurado. */
export function isEmbeddingConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.GEMINI_API_KEY || env.OPENAI_API_KEY);
}

/** Serializa un vector al literal pgvector: '[0.1,0.2,...]'. */
export function toPgVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
