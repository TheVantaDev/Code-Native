/**
 * diffService.ts — Diff Generation for Tool Edits
 *
 * Captures original file content before edits, computes diffs,
 * and provides structured diff data for frontend visualization.
 *
 * Diff format compatible with OpenSumi's InlineChatController.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface DiffChange {
  type: 'add' | 'remove' | 'unchanged';
  startLine: number;
  endLine: number;
  content: string;
}

export interface FileDiff {
  filePath: string;
  relativePath: string;
  originalContent: string;
  newContent: string;
  changes: DiffChange[];
  summary: {
    additions: number;
    deletions: number;
    modifications: number;
  };
}

export interface DiffResult {
  filePath: string;
  diff: FileDiff | null;
  unifiedDiff: string;
  inlineDiffData: InlineDiffData | null;
}

export interface InlineDiffData {
  removedLines: LineRange[];
  addedLines: LineRange[];
  modifiedLines: ModifiedLine[];
}

export interface LineRange {
  startLine: number;
  endLine: number;
  content: string;
}

export interface ModifiedLine {
  lineNumber: number;
  originalContent: string;
  newContent: string;
}

// Store original file contents before edits
const originalContentCache = new Map<string, string>();

/**
 * Capture original file content before an edit operation.
 * Call this BEFORE modifying a file.
 */
export function captureOriginalContent(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      originalContentCache.set(filePath, content);
    } else {
      // File doesn't exist yet (creation), store empty
      originalContentCache.set(filePath, '');
    }
  } catch (err) {
    console.error(`[DiffService] Failed to capture original content: ${err}`);
    originalContentCache.set(filePath, '');
  }
}

/**
 * Compute diff after a file edit.
 * Call this AFTER modifying a file.
 */
export function computeDiff(filePath: string, workspaceRoot: string = ''): DiffResult {
  const originalContent = originalContentCache.get(filePath) || '';
  let newContent = '';

  try {
    if (fs.existsSync(filePath)) {
      newContent = fs.readFileSync(filePath, 'utf-8');
    }
  } catch (err) {
    console.error(`[DiffService] Failed to read new content: ${err}`);
  }

  // Clean up cache after computing
  originalContentCache.delete(filePath);

  // Skip diff if no changes
  if (originalContent === newContent) {
    return {
      filePath,
      diff: null,
      unifiedDiff: '',
      inlineDiffData: null,
    };
  }

  const relativePath = workspaceRoot
    ? path.relative(workspaceRoot, filePath)
    : path.basename(filePath);

  const changes = computeLineChanges(originalContent, newContent);
  const inlineDiffData = computeInlineDiffData(originalContent, newContent);
  const unifiedDiff = generateUnifiedDiff(relativePath, originalContent, newContent);

  return {
    filePath,
    diff: {
      filePath,
      relativePath,
      originalContent,
      newContent,
      changes,
      summary: summarizeChanges(changes),
    },
    unifiedDiff,
    inlineDiffData,
  };
}

/**
 * Compute line-by-line changes using a simple diff algorithm.
 */
function computeLineChanges(original: string, modified: string): DiffChange[] {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  const changes: DiffChange[] = [];

  // Simple LCS-based diff algorithm
  const lcs = computeLCS(originalLines, modifiedLines);
  let origIdx = 0;
  let modIdx = 0;
  let lcsIdx = 0;

  while (origIdx < originalLines.length || modIdx < modifiedLines.length) {
    if (lcsIdx < lcs.length && origIdx < originalLines.length && originalLines[origIdx] === lcs[lcsIdx]) {
      // Line is in LCS - unchanged
      if (modIdx < modifiedLines.length && modifiedLines[modIdx] === lcs[lcsIdx]) {
        changes.push({
          type: 'unchanged',
          startLine: modIdx + 1,
          endLine: modIdx + 1,
          content: modifiedLines[modIdx],
        });
        modIdx++;
        origIdx++;
        lcsIdx++;
      } else {
        // Line added in modified
        changes.push({
          type: 'add',
          startLine: modIdx + 1,
          endLine: modIdx + 1,
          content: modifiedLines[modIdx],
        });
        modIdx++;
      }
    } else if (origIdx < originalLines.length && (lcsIdx >= lcs.length || originalLines[origIdx] !== lcs[lcsIdx])) {
      // Line removed from original
      changes.push({
        type: 'remove',
        startLine: origIdx + 1,
        endLine: origIdx + 1,
        content: originalLines[origIdx],
      });
      origIdx++;
    } else if (modIdx < modifiedLines.length) {
      // Line added in modified
      changes.push({
        type: 'add',
        startLine: modIdx + 1,
        endLine: modIdx + 1,
        content: modifiedLines[modIdx],
      });
      modIdx++;
    } else {
      break;
    }
  }

  return changes;
}

/**
 * Compute Longest Common Subsequence of lines.
 */
function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  // Build DP table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find LCS
  const lcs: string[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

/**
 * Compute inline diff data for frontend visualization.
 * Returns line ranges for additions, deletions, and modifications.
 */
function computeInlineDiffData(original: string, modified: string): InlineDiffData {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');

  const removedLines: LineRange[] = [];
  const addedLines: LineRange[] = [];
  const modifiedLinesList: ModifiedLine[] = [];

  // Simple line-by-line comparison
  const maxLen = Math.max(originalLines.length, modifiedLines.length);

  for (let i = 0; i < maxLen; i++) {
    const origLine = i < originalLines.length ? originalLines[i] : undefined;
    const modLine = i < modifiedLines.length ? modifiedLines[i] : undefined;

    if (origLine === modLine) {
      // No change
      continue;
    }

    if (origLine === undefined && modLine !== undefined) {
      // Line added
      addedLines.push({
        startLine: i + 1,
        endLine: i + 1,
        content: modLine,
      });
    } else if (origLine !== undefined && modLine === undefined) {
      // Line removed
      removedLines.push({
        startLine: i + 1,
        endLine: i + 1,
        content: origLine,
      });
    } else if (origLine !== undefined && modLine !== undefined) {
      // Line modified
      modifiedLinesList.push({
        lineNumber: i + 1,
        originalContent: origLine,
        newContent: modLine,
      });
    }
  }

  // Merge consecutive line ranges
  return {
    removedLines: mergeConsecutiveRanges(removedLines),
    addedLines: mergeConsecutiveRanges(addedLines),
    modifiedLines: modifiedLinesList,
  };
}

/**
 * Merge consecutive line ranges for cleaner output.
 */
function mergeConsecutiveRanges(ranges: LineRange[]): LineRange[] {
  if (ranges.length === 0) return [];

  const merged: LineRange[] = [];
  let current = { ...ranges[0] };

  for (let i = 1; i < ranges.length; i++) {
    const range = ranges[i];
    if (range.startLine === current.endLine + 1) {
      // Consecutive - merge
      current.endLine = range.endLine;
      current.content += '\n' + range.content;
    } else {
      // Not consecutive - push current and start new
      merged.push(current);
      current = { ...range };
    }
  }
  merged.push(current);

  return merged;
}

/**
 * Generate unified diff format (like git diff).
 */
function generateUnifiedDiff(
  relativePath: string,
  original: string,
  modified: string,
): string {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  const changes = computeLineChanges(original, modified);

  const lines: string[] = [];
  lines.push(`--- a/${relativePath}`);
  lines.push(`+++ b/${relativePath}`);

  // Group changes into hunks
  const hunks = groupIntoHunks(changes, originalLines.length, modifiedLines.length);

  for (const hunk of hunks) {
    lines.push(`@@ -${hunk.origStart},${hunk.origCount} +${hunk.modStart},${hunk.modCount} @@`);
    for (const change of hunk.changes) {
      switch (change.type) {
        case 'unchanged':
          lines.push(` ${change.content}`);
          break;
        case 'remove':
          lines.push(`-${change.content}`);
          break;
        case 'add':
          lines.push(`+${change.content}`);
          break;
      }
    }
  }

  return lines.join('\n');
}

interface Hunk {
  origStart: number;
  origCount: number;
  modStart: number;
  modCount: number;
  changes: DiffChange[];
}

/**
 * Group changes into unified diff hunks.
 */
function groupIntoHunks(changes: DiffChange[], origLen: number, modLen: number): Hunk[] {
  if (changes.length === 0) return [];

  const contextLines = 3;
  const hunks: Hunk[] = [];
  let currentHunk: Hunk | null = null;
  let origLine = 1;
  let modLine = 1;

  for (const change of changes) {
    if (!currentHunk) {
      currentHunk = {
        origStart: Math.max(1, change.startLine - contextLines),
        origCount: 0,
        modStart: Math.max(1, change.startLine - contextLines),
        modCount: 0,
        changes: [],
      };
    }

    currentHunk.changes.push(change);

    switch (change.type) {
      case 'unchanged':
        currentHunk.origCount++;
        currentHunk.modCount++;
        break;
      case 'remove':
        currentHunk.origCount++;
        break;
      case 'add':
        currentHunk.modCount++;
        break;
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return hunks;
}

/**
 * Summarize changes for statistics.
 */
function summarizeChanges(changes: DiffChange[]): { additions: number; deletions: number; modifications: number } {
  let additions = 0;
  let deletions = 0;

  for (const change of changes) {
    if (change.type === 'add') additions++;
    if (change.type === 'remove') deletions++;
  }

  return {
    additions,
    deletions,
    modifications: Math.min(additions, deletions), // Rough estimate of modified lines
  };
}

/**
 * Format diff data as a markdown code block with highlighting hints.
 * Returns a string suitable for display in chat.
 */
export function formatDiffForChat(diffResult: DiffResult): string {
  if (!diffResult.diff || !diffResult.inlineDiffData) {
    return '';
  }

  const { removedLines, addedLines } = diffResult.inlineDiffData;
  const { summary } = diffResult.diff;

  const lines: string[] = [];
  lines.push(`**File:** \`${diffResult.diff.relativePath}\``);
  lines.push(`**Changes:** +${summary.additions} additions, -${summary.deletions} deletions`);
  lines.push('');
  lines.push('```diff');
  lines.push(diffResult.unifiedDiff);
  lines.push('```');

  return lines.join('\n');
}

/**
 * Build a structured sentinel string for the frontend to parse into a DiffCard.
 *
 * Format: %%DIFF_START%%{json}%%DIFF_END%%
 *
 * The frontend chat renderer detects this sentinel and replaces it with a
 * mounted <DiffCard> React component, showing green/red lines + Accept/Reject.
 */
export function buildDiffSentinel(diffResult: DiffResult): string {
  if (!diffResult.diff) return '';

  const payload = {
    filePath: diffResult.filePath,
    relativePath: diffResult.diff.relativePath,
    originalContent: diffResult.diff.originalContent,
    newContent: diffResult.diff.newContent,
    additions: diffResult.diff.summary.additions,
    deletions: diffResult.diff.summary.deletions,
    unifiedDiff: diffResult.unifiedDiff,
  };

  return `%%DIFF_START%%${JSON.stringify(payload)}%%DIFF_END%%`;
}

/**
 * Clear the original content cache.
 */
export function clearDiffCache(): void {
  originalContentCache.clear();
}
