/**
 * RAG Pipeline Module Index
 *
 * Exports all RAG-related functionality for CodeNative.
 */

// Core indexing
export { indexProject, getIndex, clearIndex, tokenize } from './fileIndexer';
export type { CodeChunk, IndexedProject } from './fileIndexer';

// BM25 retrieval
export { retrieve as bm25Retrieve } from './contextRetriever';
export type { RetrievalResult } from './contextRetriever';

// Vector retrieval (ChromaDB)
export {
  indexChunksIntoChroma,
  hybridRetrieve,
  isVectorIndexAvailable,
  resetVectorIndex,
} from './vectorRetriever';

// Query classification
export { classifyQuery, extractQueryEntities } from './queryClassifier';
export type { QueryIntent, ClassificationResult } from './queryClassifier';

// Re-ranking
export {
  rerankByKeywords,
  rerankPipeline,
  reciprocalRankFusion,
  deduplicateOverlapping,
  groupByFile,
  mergeAdjacentChunks,
} from './reranker';

// Context formatting
export {
  formatContext,
  formatFileContext,
  formatContextSummary,
  getCompactFileTree,
  truncateContext,
  estimateTokens,
} from './contextFormatter';
export type { FormattedContext } from './contextFormatter';

// Prompts
export {
  getSystemPrompt,
  formatUserMessage,
  buildChatMessages,
  GENERAL_PROMPT,
  PROJECT_PROMPT,
  CODE_ACTION_PROMPT,
  HYBRID_PROMPT,
} from './prompts';

// Main pipeline (recommended entry point)
export {
  runRAGPipeline,
  shouldUseRAG,
  getRAGStatus,
  retrieveContext,
} from './ragPipeline';
export type { RAGResult, RAGOptions } from './ragPipeline';

// Smart context (fuzzy matching, error recovery)
export {
  findSimilarFiles,
  detectAmbiguousIntent,
  generateRecoverySuggestions,
  updateContext,
  getContextInfo,
  resolveVagueReference,
  enhanceQueryWithContext,
} from './smartContext';
export type { FileMatch, AmbiguousIntent, RecoverySuggestion } from './smartContext';

// Diff service (inline diff visualization)
export {
  captureOriginalContent,
  computeDiff,
  formatDiffForChat,
  clearDiffCache,
} from './diffService';
export type { DiffResult, FileDiff, DiffChange, InlineDiffData } from './diffService';
