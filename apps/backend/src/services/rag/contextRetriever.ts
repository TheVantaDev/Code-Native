/**
 * contextRetriever.ts — TF-IDF Context Retrieval for RAG
 * 
 * Given a user query, finds the most relevant code chunks
 * from the indexed project. Uses TF-IDF scoring.
 * 
 * SWAP POINT: When vector DB is ready, replace the retrieve()
 * function with vector similarity search. Input/output stays same.
 * 
 * @author CodeNative Team
 */

import { CodeChunk, getIndex, tokenize, calculateTermFrequencies } from './fileIndexer';

export interface RetrievalResult {
    chunk: CodeChunk;
    score: number;
}

/**
 * Calculate IDF (Inverse Document Frequency) for all terms in the corpus
 */
function calculateIDF(chunks: CodeChunk[]): Map<string, number> {
    const docCount = chunks.length;
    const docFreq = new Map<string, number>();

    // Count how many chunks contain each term
    for (const chunk of chunks) {
        const uniqueTerms = new Set(chunk.termFrequencies.keys());
        for (const term of uniqueTerms) {
            docFreq.set(term, (docFreq.get(term) || 0) + 1);
        }
    }

    // Calculate IDF: log(N / df)
    const idf = new Map<string, number>();
    for (const [term, df] of docFreq) {
        idf.set(term, Math.log(docCount / df));
    }

    return idf;
}

/**
 * Score a chunk against a query using TF-IDF
 */
function scoreTFIDF(
    queryTerms: Map<string, number>,
    chunk: CodeChunk,
    idf: Map<string, number>
): number {
    let score = 0;

    for (const [term, queryTF] of queryTerms) {
        const chunkTF = chunk.termFrequencies.get(term) || 0;
        const termIDF = idf.get(term) || 0;

        // TF-IDF score: queryTF * chunkTF * IDF²
        score += queryTF * chunkTF * termIDF * termIDF;
    }

    return score;
}

/**
 * Boost score if the query mentions a filename/path
 */
function fileNameBoost(query: string, chunk: CodeChunk): number {
    const queryLower = query.toLowerCase();
    const fileName = chunk.relativePath.split('/').pop()?.toLowerCase() || '';
    const pathParts = chunk.relativePath.toLowerCase().split('/');

    let boost = 0;

    // Exact filename match: huge boost
    if (queryLower.includes(fileName)) {
        boost += 10;
    }

    // Path component match
    for (const part of pathParts) {
        if (part.length > 2 && queryLower.includes(part)) {
            boost += 3;
        }
    }

    return boost;
}

/**
 * Retrieve the top-K most relevant code chunks for a query
 * 
 * @param query - The user's question/request
 * @param topK - Number of chunks to return (default: 8)
 * @returns Scored and sorted chunks
 */
export function retrieve(query: string, topK: number = 8): RetrievalResult[] {
    const index = getIndex();
    if (!index || index.chunks.length === 0) {
        return [];
    }

    const queryTerms = calculateTermFrequencies(query);
    const idf = calculateIDF(index.chunks);

    // Score all chunks
    const scored: RetrievalResult[] = index.chunks.map(chunk => ({
        chunk,
        score: scoreTFIDF(queryTerms, chunk, idf) + fileNameBoost(query, chunk),
    }));

    // Sort by score descending, take top K
    scored.sort((a, b) => b.score - a.score);

    // Filter out zero-score results and return top K
    return scored.filter(r => r.score > 0).slice(0, topK);
}

/**
 * Retrieve full file content by path (for when AI needs the whole file)
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
