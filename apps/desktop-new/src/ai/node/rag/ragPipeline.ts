/**
 * ragPipeline.ts — Main RAG Pipeline Orchestrator
 *
 * Orchestrates the full RAG pipeline:
 *   1. Query classification
 *   2. Conditional retrieval (skip for general queries)
 *   3. Hybrid search (BM25 + vector)
 *   4. Re-ranking and deduplication
 *   5. Context formatting
 *   6. Prompt construction
 *
 * This module provides a single entry point for RAG-augmented responses.
 */

import { getIndex, IndexedProject } from './fileIndexer';
import { retrieve as bm25Retrieve, RetrievalResult } from './contextRetriever';
import { hybridRetrieve, isVectorIndexAvailable } from './vectorRetriever';
import { classifyQuery, extractQueryEntities, ClassificationResult, QueryIntent } from './queryClassifier';
import { rerankPipeline, deduplicateOverlapping } from './reranker';
import { formatContext, truncateContext, FormattedContext, getCompactFileTree } from './contextFormatter';
import { getSystemPrompt, formatUserMessage, buildChatMessages } from './prompts';

export interface RAGResult {
  // Classification
  classification: ClassificationResult;

  // Retrieved context
  context: FormattedContext;
  rawResults: RetrievalResult[];

  // Formatted messages for LLM
  systemPrompt: string;
  userMessage: string;
  messages: Array<{ role: string; content: string }>;

  // Metadata
  retrievalMethod: 'hybrid' | 'bm25' | 'none';
  processingTimeMs: number;
}

export interface RAGOptions {
  // Override auto-classification
  forceIntent?: QueryIntent;

  // Retrieval settings
  topK?: number;
  maxTokens?: number;

  // Context formatting
  includeFileTree?: boolean;

  // Conversation history
  conversationHistory?: Array<{ role: string; content: string }>;
}

/**
 * Main RAG pipeline entry point.
 *
 * Takes a user query and returns everything needed for an LLM call:
 * - Classified intent
 * - Retrieved and formatted context
 * - System prompt and user message
 *
 * @param query - The user's raw query
 * @param options - Pipeline options
 */
export async function runRAGPipeline(
  query: string,
  options: RAGOptions = {},
): Promise<RAGResult> {
  const startTime = Date.now();

  const {
    forceIntent,
    topK = 8,
    maxTokens = 4000,
    includeFileTree = false,
    conversationHistory = [],
  } = options;

  // Step 1: Classify the query
  const classification = forceIntent
    ? { ...classifyQuery(query), intent: forceIntent }
    : classifyQuery(query);

  console.log(`[RAG] Query classified as: ${classification.intent} (confidence: ${classification.confidence.toFixed(2)})`);

  // Step 2: Retrieve context (if needed)
  let rawResults: RetrievalResult[] = [];
  let retrievalMethod: 'hybrid' | 'bm25' | 'none' = 'none';

  if (classification.shouldRetrieve) {
    const retrieveK = classification.suggestedTopK || topK;

    // Try hybrid retrieval first
    rawResults = await hybridRetrieve(query, retrieveK * 2); // Get extra for re-ranking

    if (isVectorIndexAvailable()) {
      retrievalMethod = 'hybrid';
      console.log(`[RAG] Hybrid retrieval: ${rawResults.length} results`);
    } else {
      // Fall back to BM25 only
      rawResults = bm25Retrieve(query, retrieveK * 2, true);
      retrievalMethod = 'bm25';
      console.log(`[RAG] BM25 retrieval: ${rawResults.length} results`);
    }

    // Step 3: Re-rank results
    if (rawResults.length > 0) {
      rawResults = rerankPipeline(rawResults, query, retrieveK);
      console.log(`[RAG] After re-ranking: ${rawResults.length} results`);
    }

    // Step 4: Truncate to fit token budget
    rawResults = truncateContext(rawResults, maxTokens);
  }

  // Step 5: Format context
  const context = formatContext(rawResults, {
    style: rawResults.length > 3 ? 'grouped' : 'indexed',
    includeFileTree,
  });

  // Step 6: Build prompts
  const systemPrompt = getSystemPrompt(classification.intent, context.text.length > 0);
  const userMessage = formatUserMessage(query, context.text, classification.intent);
  const messages = buildChatMessages(query, context.text, classification.intent, conversationHistory);

  const processingTimeMs = Date.now() - startTime;
  console.log(`[RAG] Pipeline completed in ${processingTimeMs}ms`);

  return {
    classification,
    context,
    rawResults,
    systemPrompt,
    userMessage,
    messages,
    retrievalMethod,
    processingTimeMs,
  };
}

/**
 * Quick check if RAG retrieval is likely to help with this query.
 */
export function shouldUseRAG(query: string): boolean {
  const classification = classifyQuery(query);
  return classification.shouldRetrieve;
}

/**
 * Get a debug summary of the RAG pipeline state.
 */
export function getRAGStatus(): {
  indexed: boolean;
  vectorAvailable: boolean;
  chunkCount: number;
  fileCount: number;
} {
  const index = getIndex();

  return {
    indexed: !!index,
    vectorAvailable: isVectorIndexAvailable(),
    chunkCount: index?.chunks.length ?? 0,
    fileCount: index?.totalFiles ?? 0,
  };
}

/**
 * Simplified retrieval for cases where you just need the raw results.
 */
export async function retrieveContext(
  query: string,
  topK: number = 8,
): Promise<RetrievalResult[]> {
  const classification = classifyQuery(query);

  if (!classification.shouldRetrieve) {
    return [];
  }

  let results = await hybridRetrieve(query, topK * 2);

  if (results.length === 0) {
    results = bm25Retrieve(query, topK * 2, true);
  }

  return rerankPipeline(results, query, topK);
}

/**
 * Re-export key types for external use.
 */
export type { ClassificationResult, QueryIntent } from './queryClassifier';
export type { RetrievalResult } from './contextRetriever';
export type { FormattedContext } from './contextFormatter';
