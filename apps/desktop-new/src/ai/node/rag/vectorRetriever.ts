/**
 * vectorRetriever.ts — ChromaDB Vector Retrieval for RAG
 *
 * Provides semantic (embedding-based) search as a complement to the BM25
 * keyword search in contextRetriever.ts.  Results from both retrievers are
 * fused using Reciprocal Rank Fusion (RRF) to produce a single ranked list.
 *
 * Architecture:
 *   1. indexChunksIntoChroma() — called once after indexProject()
 *        • generates embeddings via Ollama /api/embeddings
 *        • stores chunks + embeddings in ChromaDB collection
 *   2. hybridRetrieve()        — main entry point for RAG context injection
 *        • runs BM25 + vector in parallel
 *        • merges with RRF
 *        • falls back to BM25-only when ChromaDB is unavailable
 *
 * Configuration (env vars, all optional):
 *   CHROMA_URL        — ChromaDB URL, default http://localhost:8000
 *   CHROMA_COLLECTION — collection name, default "codenative_chunks"
 *   EMBEDDING_MODEL   — Ollama model for embeddings, default "nomic-embed-text"
 *   VECTOR_SEARCH_K   — how many vector results to fetch, default 8
 *
 * Falls back gracefully to BM25-only when ChromaDB is not running.
 */

import { CodeChunk, getIndex } from './fileIndexer';
import { retrieve as bm25Retrieve, RetrievalResult } from './contextRetriever';

type ChromaCollection = {
  delete(args: { where: Record<string, unknown> }): Promise<unknown>;
  add(args: {
    ids: string[];
    embeddings: number[][];
    documents: string[];
    metadatas: Array<Record<string, string | number>>;
  }): Promise<unknown>;
  query(args: {
    queryEmbeddings: number[][];
    nResults: number;
    where: Record<string, unknown>;
  }): Promise<{
    ids: string[][];
    distances?: number[][];
    metadatas: Array<Array<Record<string, string | number> | null>>;
  }>;
};

type ChromaClientLike = {
  getOrCreateCollection(args: { name: string }): Promise<ChromaCollection>;
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CHROMA_URL = process.env.CHROMA_URL ?? 'http://localhost:8000';
const COLLECTION_NAME = process.env.CHROMA_COLLECTION ?? 'codenative_chunks';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'nomic-embed-text';
const OLLAMA_EMBED_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const VECTOR_K = parseInt(process.env.VECTOR_SEARCH_K ?? '8', 10);
const EMBED_BATCH_SIZE = 20; // embed in batches to avoid overwhelming Ollama

// RRF constant — typical value is 60
const RRF_K = 60;

// ---------------------------------------------------------------------------
// ChromaDB client (lazy singleton)
// ---------------------------------------------------------------------------

let _client: ChromaClientLike | null = null;
let _collection: ChromaCollection | null = null;
let chromaAvailable = false;
let _chromaModule: { ChromaClient: new (...args: unknown[]) => ChromaClientLike } | null | undefined;

function getChromaModule(): { ChromaClient: new (...args: unknown[]) => ChromaClientLike } | null {
  if (_chromaModule !== undefined) return _chromaModule;

  try {
    _chromaModule = require('chromadb') as { ChromaClient: new (...args: unknown[]) => ChromaClientLike };
  } catch {
    _chromaModule = null;
  }

  return _chromaModule;
}

function getChromaClient(): ChromaClientLike | null {
  const chroma = getChromaModule();
  if (!chroma) return null;

  if (!_client) {
    _client = new chroma.ChromaClient({ path: CHROMA_URL });
  }

  return _client;
}

/** Get or create the chunk collection. Returns null if ChromaDB is unreachable. */
async function getCollection(): Promise<ChromaCollection | null> {
  if (_collection) return _collection;
  try {
    const client = getChromaClient();
    if (!client) {
      chromaAvailable = false;
      return null;
    }

    _collection = await client.getOrCreateCollection({ name: COLLECTION_NAME });
    chromaAvailable = true;
    return _collection;
  } catch {
    chromaAvailable = false;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Ollama embedding generation
// ---------------------------------------------------------------------------

async function embed(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${OLLAMA_EMBED_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { embedding?: number[] };
    return json.embedding ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Indexing
// ---------------------------------------------------------------------------

/**
 * (Re-)index all chunks from the current in-memory project index into
 * ChromaDB. Safe to call multiple times — existing data is cleared first.
 *
 * Skips silently when ChromaDB or Ollama embeddings are unavailable.
 */
export async function indexChunksIntoChroma(): Promise<void> {
  const index = getIndex();
  if (!index || index.chunks.length === 0) return;

  const collection = await getCollection();
  if (!collection) {
    console.warn('⚠️  ChromaDB unavailable — vector index skipped, using BM25 only');
    return;
  }

  try {
    await collection.delete({ where: { rootPath: { $eq: index.rootPath } } });
  } catch {
    // Collection might be empty — ignore
  }

  console.log(`🔢 Generating embeddings for ${index.chunks.length} chunks…`);
  let indexed = 0;

  for (let i = 0; i < index.chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = index.chunks.slice(i, i + EMBED_BATCH_SIZE);
    const embeddings = await Promise.all(batch.map(c => embed(c.content)));

    const validItems = batch
      .map((chunk, j) => ({ chunk, embedding: embeddings[j] }))
      .filter((item): item is { chunk: CodeChunk; embedding: number[] } =>
        item.embedding !== null,
      );

    if (validItems.length === 0) continue;

    await collection.add({
      ids:        validItems.map(x => x.chunk.id),
      embeddings: validItems.map(x => x.embedding),
      documents:  validItems.map(x => x.chunk.content),
      metadatas:  validItems.map(x => ({
        relativePath: x.chunk.relativePath,
        filePath:     x.chunk.filePath,
        startLine:    x.chunk.startLine,
        endLine:      x.chunk.endLine,
        language:     x.chunk.language,
        rootPath:     index.rootPath,
      })),
    });

    indexed += validItems.length;
  }

  console.log(`✅ Vector index: ${indexed}/${index.chunks.length} chunks stored in ChromaDB`);
}

// ---------------------------------------------------------------------------
// Vector retrieval
// ---------------------------------------------------------------------------

async function retrieveVector(
  query: string,
  topK: number = VECTOR_K,
): Promise<RetrievalResult[]> {
  const index = getIndex();
  if (!index) return [];

  const collection = await getCollection();
  if (!collection) return [];

  const queryEmbedding = await embed(query);
  if (!queryEmbedding) return [];

  try {
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
      where: { rootPath: { $eq: index.rootPath } },
    });

    const ids       = results.ids[0]        ?? [];
    const distances = results.distances?.[0] ?? [];
    const metadatas = results.metadatas[0]   ?? [];

    return ids
      .map((id, i) => {
        const meta = metadatas[i] as Record<string, string | number> | null;
        if (!meta) return null;

        const chunk = index.chunks.find(c => c.id === id);
        if (!chunk) return null;

        const distance = distances[i] ?? 1;
        const score = 1 / (1 + distance);

        return { chunk, score } as RetrievalResult;
      })
      .filter((r): r is RetrievalResult => r !== null);
  } catch (err) {
    console.warn('⚠️  Vector retrieval error:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Hybrid search (BM25 + vector via Reciprocal Rank Fusion)
// ---------------------------------------------------------------------------

function reciprocalRankFusion(
  lists: RetrievalResult[][],
  topK: number,
): RetrievalResult[] {
  const scoreMap = new Map<string, { result: RetrievalResult; rrfScore: number }>();

  for (const list of lists) {
    list.forEach((item, rank) => {
      const existing = scoreMap.get(item.chunk.id);
      const addition = 1 / (RRF_K + rank + 1);
      if (existing) {
        existing.rrfScore += addition;
      } else {
        scoreMap.set(item.chunk.id, { result: item, rrfScore: addition });
      }
    });
  }

  return Array.from(scoreMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, topK)
    .map(entry => ({ ...entry.result, score: entry.rrfScore }));
}

/**
 * Hybrid retrieval: BM25 + semantic vector search fused with RRF.
 *
 * Falls back gracefully to BM25-only when ChromaDB / Ollama embeddings
 * are not available.
 *
 * @param query - User question / request
 * @param topK  - Maximum number of chunks to return
 */
export async function hybridRetrieve(
  query: string,
  topK: number = 8,
): Promise<RetrievalResult[]> {
  const bm25Results = bm25Retrieve(query, topK, true);
  const vectorResults = await retrieveVector(query, topK);

  if (vectorResults.length === 0) {
    return bm25Results;
  }

  return reciprocalRankFusion([bm25Results, vectorResults], topK);
}

/** Whether ChromaDB was successfully used in the last operation */
export function isVectorIndexAvailable(): boolean {
  return chromaAvailable;
}

/** Drop the in-memory collection handle (called on re-index) */
export function resetVectorIndex(): void {
  _collection = null;
  _client = null;
  chromaAvailable = false;
}
