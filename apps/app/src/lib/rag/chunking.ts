import type { StructuredContent } from "@/types/budget";

/**
 * Chunking de históricos para RAG.
 *
 * Estrategia: si hay extracción semántica, cada "cajita" es un chunk natural
 * (texto corto y denso). El texto crudo se trocea por párrafos hasta
 * ~CHUNK_SIZE chars con solapamiento, para no cortar ideas al medio.
 */

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;

export interface BudgetChunkInput {
  chunkIndex: number;
  content: string;
}

/** Trocea texto plano por párrafos respetando un tamaño máximo. */
export function chunkPlainText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (normalized.length <= CHUNK_SIZE) return [normalized];

  const paragraphs = normalized.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const piece = para.trim();
    if (!piece) continue;
    if (current.length + piece.length + 2 <= CHUNK_SIZE) {
      current = current ? `${current}\n\n${piece}` : piece;
      continue;
    }
    if (current) chunks.push(current);
    if (piece.length <= CHUNK_SIZE) {
      current = piece;
    } else {
      // Párrafo gigante: cortar duro con solapamiento.
      let start = 0;
      while (start < piece.length) {
        chunks.push(piece.slice(start, start + CHUNK_SIZE));
        start += CHUNK_SIZE - CHUNK_OVERLAP;
      }
      current = "";
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Construye los chunks de un histórico. Header con metadata en cada chunk para
 * que el embedding capture contexto (título/cliente/rubro del presupuesto).
 */
export function buildBudgetChunks(params: {
  title: string;
  client?: string | null;
  location?: string | null;
  structured?: StructuredContent | null;
  rawText?: string | null;
}): BudgetChunkInput[] {
  const headerParts = [
    `Presupuesto: ${params.title}`,
    params.client ? `Cliente: ${params.client}` : null,
    params.location ? `Ubicación: ${params.location}` : null,
  ].filter(Boolean);
  const header = headerParts.join(" · ");

  const bodies: string[] = [];

  if (params.structured) {
    const s = params.structured;
    if (s.resumen) bodies.push(`Resumen: ${s.resumen}`);
    if (s.tareasDetalladas.length > 0) {
      bodies.push(`Tareas detalladas:\n- ${s.tareasDetalladas.join("\n- ")}`);
    }
    if (s.productosEquipos.length > 0) {
      bodies.push(`Productos y equipos:\n- ${s.productosEquipos.join("\n- ")}`);
    }
    if (s.entregables.length > 0) {
      bodies.push(`Entregables:\n- ${s.entregables.join("\n- ")}`);
    }
    if (s.condicionesComerciales.length > 0) {
      bodies.push(
        `Condiciones comerciales:\n- ${s.condicionesComerciales.join("\n- ")}`,
      );
    }
  }

  // Si la extracción semántica no aportó nada, caer al texto crudo.
  if (bodies.length === 0 && params.rawText) {
    bodies.push(...chunkPlainText(params.rawText));
  }

  return bodies.map((body, i) => ({
    chunkIndex: i,
    content: `${header}\n\n${body}`,
  }));
}
