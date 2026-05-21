/**
 * promptCompressor.ts — Context-Aware Prompt Compression
 *
 * Research basis: "LLM context pruning and relevance-aware prompt construction
 * for resource-constrained local LLM inference in IDE environments."
 *
 * Problem: Naively injecting whole files into the prompt wastes tokens and
 * makes local LLMs slow. A 400-line file that has one relevant function costs
 * the same tokens as injecting all 400 lines.
 *
 * Solution (zero extra LLM calls, pure in-memory):
 *   1. Split the file into logical sections at function/class boundaries
 *      (reuses the same patterns as fileIndexer's structure-aware chunker).
 *   2. Score each section against the query using BM25 token-overlap —
 *      the same tokenizer already used for retrieval.
 *   3. HIGH-relevance sections → injected verbatim.
 *   4. LOW-relevance sections → replaced with a compact one-line summary:
 *         // ··· [lines 44-89 — createUser(), deleteUser(), updatePassword()] ···
 *   5. Cap total output at MAX_OUTPUT_LINES (default 150).
 *
 * Typical result: 60-80% token reduction on large files while keeping
 * the most relevant code right in front of the model.
 */

import * as path from 'path';
import { tokenize } from './fileIndexer';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CompressedContext {
  /** Compressed file content ready for prompt injection */
  content: string;
  /** Original line count */
  originalLines: number;
  /** Line count after compression */
  compressedLines: number;
  /** 0 = no compression, 0.7 = 70% of lines removed */
  compressionRatio: number;
  sectionsKept: number;
  sectionsSkipped: number;
  /** True when the file was small enough to be returned as-is */
  wasAlreadySmall: boolean;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Files with <= this many lines are returned verbatim (no compression needed) */
const SMALL_FILE_THRESHOLD = 120;

/** Hard cap on output lines for large files */
const MAX_OUTPUT_LINES = 150;

/**
 * Normalised score threshold to include a section verbatim.
 * Score is: (matching query tokens in section) / (total query tokens)
 */
const HIGH_RELEVANCE_THRESHOLD = 0.12;

/**
 * Sections scoring below this are fully collapsed to a summary line.
 * Sections between MED and HIGH get a trimmed (≤ TRIM_LINES) version.
 */
const MED_RELEVANCE_THRESHOLD = 0.04;

/** Max lines shown for medium-relevance sections */
const MED_SECTION_MAX_LINES = 25;

/** Max lines shown per high-relevance section (prevents one huge function eating the budget) */
const HIGH_SECTION_MAX_LINES = 80;

// ---------------------------------------------------------------------------
// Language boundary patterns (shared logic with fileIndexer chunker)
// ---------------------------------------------------------------------------

const BOUNDARY_PATTERNS: Record<string, RegExp> = {
  typescript: /^\s*(export\s+)?(default\s+)?(async\s+)?(function|class|const\s+\w+\s*(?:=|:)|let\s+\w+\s*=|interface|type\s+\w+\s*[=<]|enum|abstract\s+class|namespace)\s+\w/,
  javascript: /^\s*(export\s+)?(default\s+)?(async\s+)?(function|class|const\s+\w+\s*=|let\s+\w+\s*=)\s+\w/,
  python:     /^(def |class |async def )\w/,
  java:       /^\s*(public|private|protected|static|final|abstract)(\s+\w+)*\s+(class|interface|enum|\w+\s*\()/,
  go:         /^func\s/,
  rust:       /^(pub(\s*\(crate\))?\s+)?(fn |struct |impl |enum |trait |mod )\w/,
  cpp:        /^\w[\w:<>*& ]+\s+\w+\s*\(/,
  c:          /^\w[\w* ]+\s+\w+\s*\(/,
};

const EXT_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python',
  '.java': 'java',
  '.go': 'go',
  '.rs': 'rust',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp',
  '.c': 'c', '.h': 'c',
};

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface Section {
  startLine: number; // 1-indexed
  endLine: number;   // 1-indexed, inclusive
  lines: string[];
  /** Short label extracted from the first line */
  label: string;
  /** Raw BM25 token-overlap score */
  score: number;
  /** Score normalised to [0,1] relative to the best section */
  normScore: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a human-readable label from the opening line of a section */
function extractLabel(firstLine: string): string {
  // Match: function/class/const/def/fn name
  const m = firstLine.match(
    /(?:function|class|const|let|var|def|async def|func|fn|struct|trait|enum|interface|type|impl)\s+(\w+)/,
  );
  if (m) return m[1] + '()';
  // Fallback: first 40 non-whitespace chars
  return firstLine.trim().slice(0, 40) || '(section)';
}

/** BM25-style token-overlap score: |query ∩ section| / |query| */
function scoreSection(sectionLines: string[], queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const sectionTokenSet = new Set(tokenize(sectionLines.join('\n')));
  let hits = 0;
  for (const qt of queryTokens) {
    if (sectionTokenSet.has(qt)) hits++;
  }
  return hits / queryTokens.length;
}

/** Split file lines into logical sections using language-specific boundary patterns */
function splitIntoSections(lines: string[], language: string): Section[] {
  const pattern = BOUNDARY_PATTERNS[language];

  // No pattern or tiny file → one section
  if (!pattern || lines.length < 8) {
    return [{
      startLine: 1,
      endLine: lines.length,
      lines,
      label: '(file)',
      score: 0,
      normScore: 0,
    }];
  }

  // Find boundary line indices
  const boundaries: number[] = [0];
  for (let i = 1; i < lines.length; i++) {
    if (pattern.test(lines[i])) boundaries.push(i);
  }
  boundaries.push(lines.length);

  const sections: Section[] = [];
  for (let b = 0; b < boundaries.length - 1; b++) {
    const start = boundaries[b];
    const end   = boundaries[b + 1];
    const sl    = lines.slice(start, end);
    sections.push({
      startLine: start + 1,
      endLine:   end,
      lines:     sl,
      label:     extractLabel(sl[0] || ''),
      score:     0,
      normScore: 0,
    });
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compress a file's content for injection into an LLM prompt.
 *
 * @param fileContent - Full file content
 * @param filePath    - Absolute or relative path (used to detect language)
 * @param query       - The user's current question / request
 * @param maxLines    - Output line cap (default: MAX_OUTPUT_LINES = 150)
 */
export function compressFileForQuery(
  fileContent: string,
  filePath:    string,
  query:       string,
  maxLines:    number = MAX_OUTPUT_LINES,
): CompressedContext {
  const lines        = fileContent.split('\n');
  const originalLines = lines.length;

  // ── Fast path: small files don't need compression ──
  if (originalLines <= SMALL_FILE_THRESHOLD) {
    return {
      content:          fileContent,
      originalLines,
      compressedLines:  originalLines,
      compressionRatio: 0,
      sectionsKept:     1,
      sectionsSkipped:  0,
      wasAlreadySmall:  true,
    };
  }

  // ── Detect language ──
  const ext      = path.extname(filePath).toLowerCase();
  const language = EXT_TO_LANGUAGE[ext] || 'text';

  // ── Tokenize query (reuse BM25 tokenizer for consistency with retrieval) ──
  const queryTokens = tokenize(query);

  // ── Split into sections and score ──
  const sections = splitIntoSections(lines, language);

  for (const s of sections) {
    s.score = scoreSection(s.lines, queryTokens);
  }

  // Normalise scores relative to the best section
  const maxScore = Math.max(...sections.map(s => s.score), 0.001);
  for (const s of sections) {
    s.normScore = s.score / maxScore;
  }

  // ── Build output in original file order ──
  const outputLines: string[] = [];
  let   sectionsKept    = 0;
  let   sectionsSkipped = 0;

  // Accumulator for consecutive low-relevance sections → one summary line
  let skippedLabels: string[] = [];
  let skippedStart  = -1;
  let skippedEnd    = -1;

  const flushSkipped = () => {
    if (skippedLabels.length === 0) return;
    const lineRange = `lines ${skippedStart}–${skippedEnd}`;
    const labelStr  = skippedLabels.length > 6
      ? skippedLabels.slice(0, 6).join(', ') + ` +${skippedLabels.length - 6} more`
      : skippedLabels.join(', ');
    outputLines.push(`// ··· [${lineRange} — ${labelStr}] ···`);
    skippedLabels = [];
    skippedStart  = -1;
    skippedEnd    = -1;
  };

  const remaining = () => maxLines - outputLines.length;

  for (const s of sections) {
    if (remaining() <= 0) {
      // Budget exhausted — collapse everything remaining
      if (skippedStart === -1) skippedStart = s.startLine;
      skippedEnd = s.endLine;
      skippedLabels.push(s.label);
      sectionsSkipped++;
      continue;
    }

    const isHigh = s.score >= HIGH_RELEVANCE_THRESHOLD || s.normScore >= 0.7;
    const isMed  = s.score >= MED_RELEVANCE_THRESHOLD  || s.normScore >= 0.3;

    if (isHigh || isMed) {
      flushSkipped();

      const sectionLineCap = isHigh ? HIGH_SECTION_MAX_LINES : MED_SECTION_MAX_LINES;
      const toAdd = s.lines.slice(0, Math.min(sectionLineCap, remaining()));

      outputLines.push(...toAdd);

      // If we trimmed within-section, add a note
      if (s.lines.length > sectionLineCap) {
        const hidden = s.lines.length - sectionLineCap;
        if (remaining() > 0) {
          outputLines.push(`// ··· [${hidden} more lines in ${s.label}] ···`);
        }
      }

      sectionsKept++;
    } else {
      // Low relevance — accumulate into summary
      if (skippedStart === -1) skippedStart = s.startLine;
      skippedEnd = s.endLine;
      skippedLabels.push(s.label);
      sectionsSkipped++;
    }
  }

  flushSkipped();

  const compressedLines  = outputLines.length;
  const compressionRatio = parseFloat((1 - compressedLines / originalLines).toFixed(2));

  console.log(
    `[CodeNative AI] Compressed ${path.basename(filePath)}: ` +
    `${originalLines}→${compressedLines} lines (${Math.round(compressionRatio * 100)}% reduction), ` +
    `${sectionsKept} kept, ${sectionsSkipped} collapsed`,
  );

  return {
    content:         outputLines.join('\n'),
    originalLines,
    compressedLines,
    compressionRatio,
    sectionsKept,
    sectionsSkipped,
    wasAlreadySmall: false,
  };
}

/**
 * Compress tool read_file output for storage in agent history.
 * Full content goes to the user stream; only a lean summary is kept in
 * the messages[] array so subsequent rounds don't re-read the whole file.
 *
 * @param toolMessage  - The raw [Contents of /path …] string from read_file
 * @param query        - Current user query for relevance scoring
 * @returns Compressed version fit for messages history
 */
export function compressToolReadResult(toolMessage: string, query: string): string {
  // Extract path and content from the standard read_file message format
  const headerMatch = toolMessage.match(/^\[Contents of (.+?) — (\d+) lines\]\n/);
  if (!headerMatch) return toolMessage; // Unknown format — return as-is

  const filePath    = headerMatch[1];
  const fileContent = toolMessage.slice(headerMatch[0].length);

  // Strip line-number prefixes that read_file adds (e.g. "  1| code here")
  const strippedContent = fileContent
    .split('\n')
    .map(l => l.replace(/^\s*\d+\|\s?/, ''))
    .join('\n');

  const compressed = compressFileForQuery(strippedContent, filePath, query, 80);

  if (compressed.wasAlreadySmall) return toolMessage; // Already small — keep original

  return (
    `[Contents of ${filePath} — ${compressed.originalLines} lines, ` +
    `showing ${compressed.compressedLines} relevant lines]\n` +
    compressed.content
  );
}
