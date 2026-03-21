/**
 * contextFormatter.ts — Context Formatting for RAG
 *
 * Formats retrieved code chunks into structured context for the LLM.
 * Uses XML-style tags (like Perplexica) for clear separation.
 *
 * Format patterns:
 *   - XML tags for machine-parseable structure
 *   - File grouping for reduced repetition
 *   - Language-aware code blocks
 *   - Relevance indicators
 */

import { RetrievalResult } from './contextRetriever';
import { CodeChunk, IndexedProject, getIndex } from './fileIndexer';
import { groupByFile } from './reranker';

export interface FormattedContext {
  text: string;
  fileCount: number;
  chunkCount: number;
  totalLines: number;
}

/**
 * Format a single code chunk with metadata.
 */
function formatChunk(chunk: CodeChunk, index: number): string {
  const lines = `lines ${chunk.startLine}-${chunk.endLine}`;
  return `<code_chunk index="${index + 1}" file="${chunk.relativePath}" ${lines} language="${chunk.language}">
${chunk.content}
</code_chunk>`;
}

/**
 * Format results grouped by file (reduces repetition).
 */
function formatGroupedByFile(results: RetrievalResult[]): string {
  const grouped = groupByFile(results);
  const sections: string[] = [];

  let chunkIndex = 0;
  for (const [relativePath, chunks] of Array.from(grouped.entries())) {
    const fileSection: string[] = [];
    fileSection.push(`<file path="${relativePath}">`);

    for (const { chunk, score } of chunks) {
      const lines = `lines ${chunk.startLine}-${chunk.endLine}`;
      const scoreNote = score > 0.5 ? 'highly relevant' : 'possibly relevant';
      fileSection.push(`  <chunk ${lines} relevance="${scoreNote}">`);
      fileSection.push(chunk.content.split('\n').map(l => '    ' + l).join('\n'));
      fileSection.push('  </chunk>');
      chunkIndex++;
    }

    fileSection.push('</file>');
    sections.push(fileSection.join('\n'));
  }

  return sections.join('\n\n');
}

/**
 * Format results as individual indexed chunks (simpler, for smaller result sets).
 */
function formatAsIndexedChunks(results: RetrievalResult[]): string {
  return results.map((r, i) => formatChunk(r.chunk, i)).join('\n\n');
}

/**
 * Generate a compact file tree for orientation.
 */
export function getCompactFileTree(maxLines: number = 20): string {
  const index = getIndex();
  if (!index) return '';

  const lines = index.fileTree.split('\n').slice(0, maxLines);
  if (index.fileTree.split('\n').length > maxLines) {
    lines.push('... (truncated)');
  }

  return `<project_structure>
${lines.join('\n')}
</project_structure>`;
}

/**
 * Format retrieved results into structured context.
 *
 * @param results - Retrieved and re-ranked results
 * @param options - Formatting options
 */
export function formatContext(
  results: RetrievalResult[],
  options: {
    style?: 'grouped' | 'indexed';
    includeFileTree?: boolean;
    maxFileTreeLines?: number;
  } = {},
): FormattedContext {
  const {
    style = 'grouped',
    includeFileTree = false,
    maxFileTreeLines = 15,
  } = options;

  if (results.length === 0) {
    return {
      text: '',
      fileCount: 0,
      chunkCount: 0,
      totalLines: 0,
    };
  }

  const sections: string[] = [];

  // Optionally include file tree
  if (includeFileTree) {
    const tree = getCompactFileTree(maxFileTreeLines);
    if (tree) sections.push(tree);
  }

  // Format the results
  sections.push('<retrieved_code note="Relevant code from the project for context">');

  if (style === 'grouped' && results.length > 3) {
    sections.push(formatGroupedByFile(results));
  } else {
    sections.push(formatAsIndexedChunks(results));
  }

  sections.push('</retrieved_code>');

  // Calculate stats
  const uniqueFiles = new Set(results.map(r => r.chunk.relativePath));
  const totalLines = results.reduce(
    (sum, r) => sum + (r.chunk.endLine - r.chunk.startLine + 1),
    0,
  );

  return {
    text: sections.join('\n\n'),
    fileCount: uniqueFiles.size,
    chunkCount: results.length,
    totalLines,
  };
}

/**
 * Format context for file-specific operations (edit, explain, etc.).
 * Includes the full file content plus surrounding project context.
 */
export function formatFileContext(
  filePath: string,
  fileContent: string,
  relatedResults: RetrievalResult[],
): string {
  const sections: string[] = [];

  // Primary file
  sections.push(`<current_file path="${filePath}" note="This is the file the user is working on">
${fileContent}
</current_file>`);

  // Related code from other files
  if (relatedResults.length > 0) {
    sections.push('<related_code note="Other relevant code from the project">');
    sections.push(formatAsIndexedChunks(relatedResults));
    sections.push('</related_code>');
  }

  return sections.join('\n\n');
}

/**
 * Format a minimal context summary when full context isn't needed.
 * Just lists relevant files without full content.
 */
export function formatContextSummary(results: RetrievalResult[]): string {
  if (results.length === 0) return '';

  const grouped = groupByFile(results);
  const summaries: string[] = [];

  for (const [relativePath, chunks] of Array.from(grouped.entries())) {
    const lineRanges = chunks
      .map(c => `${c.chunk.startLine}-${c.chunk.endLine}`)
      .join(', ');
    summaries.push(`  - ${relativePath} (lines: ${lineRanges})`);
  }

  return `<relevant_files note="Files that might be relevant to this query">
${summaries.join('\n')}
</relevant_files>`;
}

/**
 * Estimate token count for context planning.
 * Rough estimate: ~4 chars per token for code.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate context to fit within token budget.
 */
export function truncateContext(
  results: RetrievalResult[],
  maxTokens: number = 4000,
): RetrievalResult[] {
  let totalChars = 0;
  const maxChars = maxTokens * 4;
  const truncated: RetrievalResult[] = [];

  for (const result of results) {
    const chunkChars = result.chunk.content.length + 100; // +100 for metadata
    if (totalChars + chunkChars > maxChars) break;
    truncated.push(result);
    totalChars += chunkChars;
  }

  return truncated;
}
