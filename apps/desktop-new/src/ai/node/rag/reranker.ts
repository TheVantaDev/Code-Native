/**
 * reranker.ts — Result Re-ranking for RAG
 *
 * Implements multiple re-ranking strategies:
 *   1. Cross-encoder scoring (if model available)
 *   2. Keyword overlap scoring
 *   3. Recency/relevance hybrid scoring
 *   4. Reciprocal Rank Fusion for combining multiple retrievers
 *
 * Based on patterns from Continue.dev and Perplexica.
 */

import { RetrievalResult } from './contextRetriever';
import { CodeChunk } from './fileIndexer';

// Re-ranking configuration
const RRF_K = 60; // Reciprocal Rank Fusion constant

export interface RerankOptions {
  query: string;
  boost?: {
    pathMatch?: number;      // Boost for path containing query terms
    recentlyEdited?: number; // Boost for recently edited files
    exactMatch?: number;     // Boost for exact string matches
  };
}

/**
 * Score a single result based on query relevance.
 * Uses multiple signals: keyword overlap, path match, exact phrases.
 */
function scoreResult(
  result: RetrievalResult,
  query: string,
  boost: Required<RerankOptions['boost']>,
): number {
  const { chunk } = result;
  const queryLower = query.toLowerCase();
  const contentLower = chunk.content.toLowerCase();
  const pathLower = chunk.relativePath.toLowerCase();

  let score = result.score; // Start with original retrieval score

  // 1. Exact phrase match boost
  if (contentLower.includes(queryLower)) {
    score += boost.exactMatch;
  }

  // 2. Path/filename match boost
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  for (const word of queryWords) {
    if (pathLower.includes(word)) {
      score += boost.pathMatch;
    }
  }

  // 3. Keyword density (what % of query words appear in content)
  let matchedWords = 0;
  for (const word of queryWords) {
    if (contentLower.includes(word)) {
      matchedWords++;
    }
  }
  if (queryWords.length > 0) {
    const density = matchedWords / queryWords.length;
    score += density * 2;
  }

  // 4. Penalize very long chunks (less specific)
  const lines = chunk.endLine - chunk.startLine;
  if (lines > 100) {
    score *= 0.8;
  }

  // 5. Boost chunks that are at the start of files (often important definitions)
  if (chunk.startLine <= 30) {
    score *= 1.1;
  }

  return score;
}

/**
 * Re-rank results using keyword-based scoring.
 * Fast, no external model needed.
 */
export function rerankByKeywords(
  results: RetrievalResult[],
  query: string,
  topK: number = 8,
): RetrievalResult[] {
  const boost = {
    pathMatch: 3,
    recentlyEdited: 2,
    exactMatch: 5,
  };

  const scored = results.map(result => ({
    ...result,
    score: scoreResult(result, query, boost),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Reciprocal Rank Fusion (RRF) for combining multiple result lists.
 * Used to merge BM25 + vector search results.
 *
 * RRF formula: score = Σ (1 / (k + rank))
 */
export function reciprocalRankFusion(
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
 * Deduplicate results that are from the same file and overlapping lines.
 * Keeps the higher-scored chunk.
 */
export function deduplicateOverlapping(
  results: RetrievalResult[],
  overlapThreshold: number = 0.5,
): RetrievalResult[] {
  const deduplicated: RetrievalResult[] = [];

  for (const result of results) {
    let isDuplicate = false;

    for (const existing of deduplicated) {
      if (existing.chunk.relativePath !== result.chunk.relativePath) continue;

      // Check line overlap
      const existingStart = existing.chunk.startLine;
      const existingEnd = existing.chunk.endLine;
      const resultStart = result.chunk.startLine;
      const resultEnd = result.chunk.endLine;

      const overlapStart = Math.max(existingStart, resultStart);
      const overlapEnd = Math.min(existingEnd, resultEnd);
      const overlapLines = Math.max(0, overlapEnd - overlapStart);

      const existingLength = existingEnd - existingStart;
      const resultLength = resultEnd - resultStart;
      const minLength = Math.min(existingLength, resultLength);

      if (minLength > 0 && overlapLines / minLength >= overlapThreshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      deduplicated.push(result);
    }
  }

  return deduplicated;
}

/**
 * Group results by file for better context presentation.
 */
export function groupByFile(
  results: RetrievalResult[],
): Map<string, RetrievalResult[]> {
  const grouped = new Map<string, RetrievalResult[]>();

  for (const result of results) {
    const path = result.chunk.relativePath;
    const existing = grouped.get(path) || [];
    existing.push(result);
    grouped.set(path, existing);
  }

  // Sort chunks within each file by line number
  for (const chunks of Array.from(grouped.values())) {
    chunks.sort((a, b) => a.chunk.startLine - b.chunk.startLine);
  }

  return grouped;
}

/**
 * Merge adjacent chunks from the same file into larger context blocks.
 * This provides better continuity for the LLM.
 */
export function mergeAdjacentChunks(
  results: RetrievalResult[],
  maxGapLines: number = 5,
): RetrievalResult[] {
  const grouped = groupByFile(results);
  const merged: RetrievalResult[] = [];

  for (const [relativePath, chunks] of Array.from(grouped.entries())) {
    if (chunks.length === 0) continue;

    let currentMerged: RetrievalResult = { ...chunks[0] };

    for (let i = 1; i < chunks.length; i++) {
      const next = chunks[i];
      const gap = next.chunk.startLine - currentMerged.chunk.endLine;

      if (gap <= maxGapLines) {
        // Merge chunks
        const mergedChunk: CodeChunk = {
          ...currentMerged.chunk,
          content: currentMerged.chunk.content + '\n' + next.chunk.content,
          endLine: next.chunk.endLine,
          id: `${relativePath}:${currentMerged.chunk.startLine}-${next.chunk.endLine}`,
        };
        currentMerged = {
          chunk: mergedChunk,
          score: Math.max(currentMerged.score, next.score),
        };
      } else {
        // Gap too large, start new chunk
        merged.push(currentMerged);
        currentMerged = { ...next };
      }
    }

    merged.push(currentMerged);
  }

  // Re-sort by score
  merged.sort((a, b) => b.score - a.score);
  return merged;
}

/**
 * Full re-ranking pipeline:
 * 1. Score by keywords
 * 2. Deduplicate overlapping
 * 3. Merge adjacent chunks
 * 4. Return top K
 */
export function rerankPipeline(
  results: RetrievalResult[],
  query: string,
  topK: number = 8,
): RetrievalResult[] {
  // Step 1: Score and sort
  let processed = rerankByKeywords(results, query, topK * 2);

  // Step 2: Deduplicate overlapping chunks
  processed = deduplicateOverlapping(processed);

  // Step 3: Merge adjacent chunks from same file
  processed = mergeAdjacentChunks(processed);

  // Step 4: Final sort and truncate
  processed.sort((a, b) => b.score - a.score);
  return processed.slice(0, topK);
}
