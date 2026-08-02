-- pgvector para CotizaAI — ejecutar UNA vez en Supabase tras `prisma migrate`.
-- La columna `embedding` NO está en schema.prisma (Prisma no soporta vector);
-- se gestiona con SQL crudo ($queryRaw/$executeRaw) y SIEMPRE se consulta
-- filtrando por "tenantId" para aislar embeddings entre empresas.
--
-- Dimensión 768 = Gemini gemini-embedding-001 (default).
-- Si se migra a OpenAI text-embedding-3-small, cambiar a vector(1536) y reindexar.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "BudgetChunk"
  ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Índice ANN por distancia coseno.
CREATE INDEX IF NOT EXISTS idx_budgetchunk_embedding
  ON "BudgetChunk"
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
