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

import { CodeChunk, getIndex } from './fileIndexer';
import { queryChroma } from './chroma';

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
export async function retrieve(query: string, topK: number = 8): Promise<RetrievalResult[]> {
    const index = getIndex();
    if (!index) return [];

    try {
        const results = await queryChroma(query, topK);
        
        if (!results.ids || results.ids.length === 0 || results.ids[0].length === 0) {
            return [];
        }

        const retrievalResults: RetrievalResult[] = [];
        
        const ids = results.ids[0];
        const distances = results.distances?.[0] || [];
        const metadatas = results.metadatas?.[0] || [];
        const documents = results.documents?.[0] || [];

        for (let i = 0; i < ids.length; i++) {
            const meta = metadatas[i] as any;
            if (!meta) continue;
            
            const chunk: CodeChunk = {
                id: ids[i],
                filePath: meta.filePath || '',
                relativePath: meta.relativePath || '',
                startLine: typeof meta.startLine === 'number' ? meta.startLine : parseInt(meta.startLine || '0', 10),
                endLine: typeof meta.endLine === 'number' ? meta.endLine : parseInt(meta.endLine || '0', 10),
                language: meta.language || 'text',
                content: documents[i] || '',
                termFrequencies: new Map()
            };
            
            // Convert distance to score (smaller distance = higher score)
            const distance = (distances[i] ?? 1) as number;
            const score = 1 / (1 + distance); 
            
            retrievalResults.push({ chunk, score });
        }
        
        return retrievalResults;
    } catch (error) {
        console.error("Vector search failed", error);
        return [];
    }
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
