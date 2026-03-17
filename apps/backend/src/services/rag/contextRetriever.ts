/**
 * contextRetriever.ts — BM25 Context Retrieval for RAG
 *
 * Replaces the previous TF-IDF scorer with Okapi BM25, which provides:
 *  - Document-length normalisation (long files don't unfairly dominate)
 *  - TF saturation (high-frequency terms get diminishing returns)
 *  - Identical input/output contract as before for easy drop-in replacement
 *
 * Additional improvements over the old TF-IDF implementation:
 *  - Query expansion: camelCase / PascalCase / snake_case splitting
 *  - Filename-path boosting (unchanged, slightly tuned)
 *  - Neighbour-chunk context expansion for top results
 *
 * @author CodeNative Team
 */

import { CodeChunk, getIndex, tokenize } from './fileIndexer';

// BM25 hyper-parameters (standard defaults; tune if needed)
const BM25_K1 = 1.5;  // term-frequency saturation (1.2–2.0 typical)
const BM25_B  = 0.75; // length normalisation (0 = off, 1 = full)

export interface RetrievalResult {
    chunk: CodeChunk;
    score: number;
}

// ---------------------------------------------------------------------------
// Query expansion
// ---------------------------------------------------------------------------

/**
 * Expand query tokens to cover camelCase / PascalCase / snake_case variants.
 *
 * e.g. "getUserById"  → ["getusersbyid", "get", "user", "by", "id"]
 *      "file_indexer" → ["file_indexer", "file", "indexer"]
 */
function expandQuery(query: string): string[] {
    // 1. Standard tokenisation (already splits on non-alnum)
    const base = tokenize(query);

    const extra: string[] = [];
    for (const token of base) {
        // snake_case split
        const snakeParts = token.split('_').filter(p => p.length > 1);
        extra.push(...snakeParts);
    }

    // 2. camelCase / PascalCase split on the RAW query
    const camelExpanded = query.replace(/([a-z])([A-Z])/g, '$1 $2');
    const camelTokens = tokenize(camelExpanded);
    extra.push(...camelTokens);

    // Deduplicate while preserving order
    const seen = new Set<string>();
    const result: string[] = [];
    for (const t of [...base, ...extra]) {
        if (!seen.has(t)) { seen.add(t); result.push(t); }
    }
    return result;
}

// ---------------------------------------------------------------------------
// BM25 corpus statistics
// ---------------------------------------------------------------------------

interface CorpusStats {
    idf: Map<string, number>;   // IDF per term
    avgDl: number;               // average document length (token count)
}

function computeCorpusStats(chunks: CodeChunk[]): CorpusStats {
    const N = chunks.length;
    const docFreq = new Map<string, number>();

    let totalTokens = 0;
    for (const chunk of chunks) {
        totalTokens += chunk.tokenCount;
        for (const term of chunk.termFrequencies.keys()) {
            docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
        }
    }

    const avgDl = N > 0 ? totalTokens / N : 1;

    // BM25 IDF: log((N - df + 0.5) / (df + 0.5) + 1)
    const idf = new Map<string, number>();
    for (const [term, df] of docFreq) {
        idf.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1));
    }

    return { idf, avgDl };
}

// ---------------------------------------------------------------------------
// BM25 scoring
// ---------------------------------------------------------------------------

function scoreBM25(
    queryTokens: string[],
    chunk: CodeChunk,
    stats: CorpusStats,
): number {
    let score = 0;
    const dl = chunk.tokenCount;
    const norm = 1 - BM25_B + BM25_B * (dl / stats.avgDl);

    for (const term of queryTokens) {
        const tf  = chunk.termFrequencies.get(term) ?? 0;
        if (tf === 0) continue;

        const idf = stats.idf.get(term) ?? 0;
        const tfSat = (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * norm);
        score += idf * tfSat;
    }

    return score;
}

// ---------------------------------------------------------------------------
// Filename / path boost (unchanged semantics, slightly tuned weights)
// ---------------------------------------------------------------------------

function fileNameBoost(query: string, chunk: CodeChunk): number {
    const queryLower = query.toLowerCase();
    const fileName = chunk.relativePath.split('/').pop()?.toLowerCase() ?? '';
    const baseFileName = fileName.replace(/\.[^.]+$/, '');
    const pathParts = chunk.relativePath.toLowerCase().split('/');

    let boost = 0;

    // Exact filename mention in query → strong boost
    if (baseFileName && queryLower.includes(baseFileName)) {
        boost += 8;
    }

    // Path component mention
    for (const part of pathParts) {
        if (part.length > 2 && queryLower.includes(part)) {
            boost += 2;
        }
    }

    return boost;
}

// ---------------------------------------------------------------------------
// Neighbour expansion
// ---------------------------------------------------------------------------

/**
 * For each top result, optionally include the immediately preceding or
 * following chunk from the same file to provide better surrounding context.
 *
 * Only adds neighbours that are not already in the result set.
 */
function expandWithNeighbours(
    results: RetrievalResult[],
    allChunks: CodeChunk[],
    maxNeighboursPerResult = 1,
): RetrievalResult[] {
    const included = new Set(results.map(r => r.chunk.id));
    const extra: RetrievalResult[] = [];

    for (const result of results) {
        const { chunk } = result;
        const fileChunks = allChunks
            .filter(c => c.relativePath === chunk.relativePath)
            .sort((a, b) => a.startLine - b.startLine);

        const idx = fileChunks.findIndex(c => c.id === chunk.id);
        if (idx === -1) continue;

        let added = 0;
        // Prefer the chunk immediately after (following context)
        for (const offset of [1, -1]) {
            if (added >= maxNeighboursPerResult) break;
            const neighbour = fileChunks[idx + offset];
            if (neighbour && !included.has(neighbour.id)) {
                included.add(neighbour.id);
                // Score slightly below the parent chunk
                extra.push({ chunk: neighbour, score: result.score * 0.5 });
                added++;
            }
        }
    }

    return [...results, ...extra];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieve the top-K most relevant code chunks for a query using BM25.
 *
 * @param query  - The user's question / request
 * @param topK   - Number of primary results to return (default: 8)
 * @param expand - Whether to include neighbour chunks (default: true)
 * @returns Scored and sorted chunks
 */
export function retrieve(
    query: string,
    topK: number = 8,
    expand = true,
): RetrievalResult[] {
    const index = getIndex();
    if (!index || index.chunks.length === 0) {
        return [];
    }

    const queryTokens = expandQuery(query);
    const stats = computeCorpusStats(index.chunks);

    // Score all chunks
    const scored: RetrievalResult[] = index.chunks.map(chunk => ({
        chunk,
        score: scoreBM25(queryTokens, chunk, stats) + fileNameBoost(query, chunk),
    }));

    // Sort descending, filter zero-score results, take top-K
    scored.sort((a, b) => b.score - a.score);
    const topResults = scored.filter(r => r.score > 0).slice(0, topK);

    if (!expand) return topResults;

    // Expand with neighbours (adds at most 1 neighbour per top result)
    const expanded = expandWithNeighbours(topResults, index.chunks, 1);
    // Re-sort after expansion
    expanded.sort((a, b) => b.score - a.score);
    return expanded;
}

/**
 * Retrieve full file content by path
 */
export function getFileChunks(relativePath: string): CodeChunk[] {
    const index = getIndex();
    if (!index) return [];

    return index.chunks
        .filter(c => c.relativePath === relativePath)
        .sort((a, b) => a.startLine - b.startLine);
}

/**
 * Get a summary of what files are indexed
 */
export function getIndexSummary(): {
    indexed: boolean;
    rootPath: string | null;
    totalFiles: number;
    totalChunks: number;
    indexedAt: string | null;
} {
    const index = getIndex();
    if (!index) {
        return { indexed: false, rootPath: null, totalFiles: 0, totalChunks: 0, indexedAt: null };
    }
    return {
        indexed: true,
        rootPath: index.rootPath,
        totalFiles: index.totalFiles,
        totalChunks: index.totalChunks,
        indexedAt: index.indexedAt.toISOString(),
    };
}

