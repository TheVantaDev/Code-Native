/**
 * smartContext.ts — Intelligent Context Understanding
 *
 * Provides fallback handling when prompts don't match exactly:
 *   - Fuzzy file name matching
 *   - Intent clarification detection
 *   - Error recovery suggestions
 *   - Context carryover from previous messages
 */

import { getIndex } from './fileIndexer';
import * as path from 'path';
import * as fs from 'fs';

// ======================== FUZZY FILE MATCHING ========================

/**
 * Levenshtein distance for fuzzy string matching.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings (0-1).
 */
function similarity(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  // Exact match
  if (aLower === bLower) return 1;

  // Contains match
  if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.8;

  // Levenshtein-based similarity
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(aLower, bLower);
  return 1 - distance / maxLen;
}

export interface FileMatch {
  path: string;
  relativePath: string;
  filename: string;
  score: number;
}

/**
 * Find files matching a fuzzy query in the workspace.
 * Returns matches sorted by relevance.
 */
export function findSimilarFiles(
  query: string,
  workspaceRoot: string,
  maxResults: number = 5,
): FileMatch[] {
  const index = getIndex();
  const matches: FileMatch[] = [];
  const seen = new Set<string>();

  // Extract just the filename from query (remove path parts)
  const queryFilename = path.basename(query).toLowerCase();
  const queryNoExt = queryFilename.replace(/\.[^.]+$/, '');

  // Search in index if available
  if (index) {
    for (const chunk of index.chunks) {
      if (seen.has(chunk.relativePath)) continue;
      seen.add(chunk.relativePath);

      const filename = path.basename(chunk.relativePath).toLowerCase();
      const filenameNoExt = filename.replace(/\.[^.]+$/, '');

      // Calculate multiple similarity scores
      const exactScore = similarity(filename, queryFilename);
      const noExtScore = similarity(filenameNoExt, queryNoExt);
      const containsScore = filename.includes(queryNoExt) ? 0.7 : 0;

      const bestScore = Math.max(exactScore, noExtScore, containsScore);

      if (bestScore > 0.4) {
        matches.push({
          path: chunk.filePath,
          relativePath: chunk.relativePath,
          filename: path.basename(chunk.relativePath),
          score: bestScore,
        });
      }
    }
  }

  // Also search workspace directly for files not in index
  if (workspaceRoot && fs.existsSync(workspaceRoot)) {
    searchDirectory(workspaceRoot, workspaceRoot, queryFilename, queryNoExt, matches, seen, 0, 4);
  }

  // Sort by score and return top matches
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, maxResults);
}

function searchDirectory(
  dir: string,
  root: string,
  queryFilename: string,
  queryNoExt: string,
  matches: FileMatch[],
  seen: Set<string>,
  depth: number,
  maxDepth: number,
) {
  if (depth > maxDepth) return;

  const IGNORE = ['node_modules', '.git', 'dist', 'build', 'out', '.cache', '__pycache__'];

  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory()) {
        if (!IGNORE.includes(item.name)) {
          searchDirectory(
            path.join(dir, item.name), root, queryFilename, queryNoExt, matches, seen, depth + 1, maxDepth
          );
        }
      } else {
        const fullPath = path.join(dir, item.name);
        const relativePath = path.relative(root, fullPath).replace(/\\/g, '/');

        if (seen.has(relativePath)) continue;

        const filename = item.name.toLowerCase();
        const filenameNoExt = filename.replace(/\.[^.]+$/, '');

        const exactScore = similarity(filename, queryFilename);
        const noExtScore = similarity(filenameNoExt, queryNoExt);
        const containsScore = filename.includes(queryNoExt) ? 0.7 : 0;

        const bestScore = Math.max(exactScore, noExtScore, containsScore);

        if (bestScore > 0.4) {
          seen.add(relativePath);
          matches.push({
            path: fullPath,
            relativePath,
            filename: item.name,
            score: bestScore,
          });
        }
      }
    }
  } catch { /* ignore access errors */ }
}

// ======================== INTENT CLARIFICATION ========================

export interface AmbiguousIntent {
  isAmbiguous: boolean;
  reason?: string;
  suggestions?: string[];
  clarificationQuestion?: string;
}

/**
 * Detect if a query is ambiguous and needs clarification.
 */
export function detectAmbiguousIntent(query: string, workspaceRoot: string): AmbiguousIntent {
  const queryLower = query.toLowerCase();

  // Check for vague file references
  const vagueFilePatterns = [
    /\b(the file|that file|this file|it)\b/i,
    /\b(the code|that code|this code)\b/i,
  ];

  for (const pattern of vagueFilePatterns) {
    if (pattern.test(query)) {
      return {
        isAmbiguous: true,
        reason: 'Vague file reference',
        clarificationQuestion: 'Which file are you referring to? Please provide the filename.',
      };
    }
  }

  // Check for multiple possible file matches
  const filePattern = /\b([\w-]+)\.(ts|tsx|js|jsx|py|java|go|rs|cpp|c|h)\b/gi;
  const fileMatches = Array.from(query.matchAll(filePattern));

  if (fileMatches.length === 1) {
    const filename = fileMatches[0][0];
    const similarFiles = findSimilarFiles(filename, workspaceRoot, 3);

    if (similarFiles.length > 1 && similarFiles[0].score < 0.95) {
      return {
        isAmbiguous: true,
        reason: 'Multiple similar files found',
        suggestions: similarFiles.map(f => f.relativePath),
        clarificationQuestion: `Did you mean one of these files?\n${similarFiles.map((f, i) => `${i + 1}. ${f.relativePath}`).join('\n')}`,
      };
    }
  }

  // Check for ambiguous actions
  const ambiguousActions = [
    { pattern: /\b(change|modify)\b/i, question: 'What specific changes do you want to make?' },
    { pattern: /\b(fix)\b/i, question: 'What issue needs to be fixed?' },
    { pattern: /\b(improve)\b/i, question: 'What aspect should be improved?' },
  ];

  // Only flag as ambiguous if action is vague AND no specific details
  const hasSpecificDetails = query.length > 50 || /\bto\b|\bwith\b|\bby\b/i.test(query);

  if (!hasSpecificDetails) {
    for (const { pattern, question } of ambiguousActions) {
      if (pattern.test(query) && query.split(/\s+/).length < 6) {
        return {
          isAmbiguous: true,
          reason: 'Vague action without details',
          clarificationQuestion: question,
        };
      }
    }
  }

  return { isAmbiguous: false };
}

// ======================== ERROR RECOVERY ========================

export interface RecoverySuggestion {
  action: string;
  reason: string;
  command?: string;
}

/**
 * Generate recovery suggestions when a tool call fails.
 */
export function generateRecoverySuggestions(
  error: string,
  toolName: string,
  args: Record<string, any>,
  workspaceRoot: string,
): RecoverySuggestion[] {
  const suggestions: RecoverySuggestion[] = [];

  // File not found errors
  if (error.includes('not found') || error.includes('does not exist')) {
    const filePath = args.file_path || args.path || '';
    const filename = path.basename(filePath);

    const similarFiles = findSimilarFiles(filename, workspaceRoot, 3);

    if (similarFiles.length > 0) {
      suggestions.push({
        action: 'Use similar file',
        reason: `File "${filename}" not found. Did you mean one of these?`,
        command: similarFiles.map(f => `  - ${f.relativePath} (${Math.round(f.score * 100)}% match)`).join('\n'),
      });
    }

    suggestions.push({
      action: 'Create new file',
      reason: 'The file does not exist yet',
      command: `create_file with path: ${filePath}`,
    });

    suggestions.push({
      action: 'List directory',
      reason: 'See what files exist',
      command: `list_files with dir_path: ${path.dirname(filePath) || workspaceRoot}`,
    });
  }

  // Text not found (find_and_replace)
  if (error.includes('Text not found') || error.includes('not found in')) {
    suggestions.push({
      action: 'Read file first',
      reason: 'Get the exact current content before editing',
      command: `read_file with path: ${args.file_path}`,
    });

    suggestions.push({
      action: 'Use create_file instead',
      reason: 'Overwrite with complete updated content',
      command: `create_file with full new content`,
    });
  }

  // Multiple matches
  if (error.includes('matches') && error.includes('locations')) {
    suggestions.push({
      action: 'Make search text more specific',
      reason: 'Include more surrounding context to make it unique',
    });

    suggestions.push({
      action: 'Use create_file instead',
      reason: 'Replace entire file content',
      command: `create_file with full new content`,
    });
  }

  return suggestions;
}

// ======================== CONTEXT MEMORY ========================

interface ConversationContext {
  recentFiles: string[];
  lastAction: string | null;
  lastFilePath: string | null;
  mentionedFiles: Map<string, number>; // filename -> mention count
}

let _context: ConversationContext = {
  recentFiles: [],
  lastAction: null,
  lastFilePath: null,
  mentionedFiles: new Map(),
};

/**
 * Update context with information from the current message/action.
 */
export function updateContext(
  action: 'file_mentioned' | 'file_edited' | 'file_created' | 'file_read' | 'clear',
  filePath?: string,
) {
  if (action === 'clear') {
    _context = {
      recentFiles: [],
      lastAction: null,
      lastFilePath: null,
      mentionedFiles: new Map(),
    };
    return;
  }

  if (filePath) {
    _context.lastFilePath = filePath;
    _context.lastAction = action;

    // Track recent files (max 10)
    const idx = _context.recentFiles.indexOf(filePath);
    if (idx !== -1) {
      _context.recentFiles.splice(idx, 1);
    }
    _context.recentFiles.unshift(filePath);
    if (_context.recentFiles.length > 10) {
      _context.recentFiles.pop();
    }

    // Count mentions
    const filename = path.basename(filePath);
    const count = _context.mentionedFiles.get(filename) || 0;
    _context.mentionedFiles.set(filename, count + 1);
  }
}

/**
 * Get context information for prompt enhancement.
 */
export function getContextInfo(): {
  recentFiles: string[];
  lastFile: string | null;
  lastAction: string | null;
  contextHint: string;
} {
  let contextHint = '';

  if (_context.lastFilePath) {
    contextHint = `Last file worked on: ${_context.lastFilePath}`;
  }

  if (_context.recentFiles.length > 1) {
    contextHint += `\nRecently mentioned files: ${_context.recentFiles.slice(0, 5).join(', ')}`;
  }

  return {
    recentFiles: _context.recentFiles,
    lastFile: _context.lastFilePath,
    lastAction: _context.lastAction,
    contextHint,
  };
}

/**
 * Resolve "the file", "that file", "it" references using context.
 */
export function resolveVagueReference(query: string): string | null {
  const vaguePatterns = [
    /\b(the file|that file|this file)\b/i,
    /\bedit it\b/i,
    /\bfix it\b/i,
    /\bmodify it\b/i,
    /\bupdate it\b/i,
  ];

  for (const pattern of vaguePatterns) {
    if (pattern.test(query) && _context.lastFilePath) {
      return _context.lastFilePath;
    }
  }

  return null;
}

// ======================== SMART PROMPT ENHANCEMENT ========================

/**
 * Enhance the user query with context and clarifications.
 * Returns the enhanced query and any notes for the system prompt.
 */
export function enhanceQueryWithContext(
  query: string,
  workspaceRoot: string,
): {
  enhancedQuery: string;
  systemNote: string;
  resolvedFile: string | null;
} {
  let enhancedQuery = query;
  let systemNote = '';
  let resolvedFile: string | null = null;

  // 1. Resolve vague file references
  const vagueResolution = resolveVagueReference(query);
  if (vagueResolution) {
    resolvedFile = vagueResolution;
    systemNote += `\n[Context] User said "the file"/"it" - they likely mean: ${vagueResolution}`;
  }

  // 2. Find similar files for mentioned filenames
  const filePattern = /\b([\w-]+)\.(ts|tsx|js|jsx|py|java|go|rs|cpp|c|h|txt|json|html|css)\b/gi;
  const fileMatches = Array.from(query.matchAll(filePattern));

  for (const match of fileMatches) {
    const filename = match[0];
    const similarFiles = findSimilarFiles(filename, workspaceRoot, 1);

    if (similarFiles.length > 0 && similarFiles[0].score >= 0.7 && similarFiles[0].score < 1) {
      systemNote += `\n[Context] "${filename}" likely refers to: ${similarFiles[0].path}`;
      if (!resolvedFile) resolvedFile = similarFiles[0].path;
    }
  }

  // 3. Add context about recent files
  const contextInfo = getContextInfo();
  if (contextInfo.contextHint) {
    systemNote += `\n${contextInfo.contextHint}`;
  }

  return {
    enhancedQuery,
    systemNote: systemNote.trim(),
    resolvedFile,
  };
}
