/**
 * fileIndexer.ts — Project File Indexer for RAG
 *
 * Recursively reads a project directory and chunks files into
 * searchable segments. Chunks are stored in memory and used by
 * contextRetriever.ts (BM25) and vectorRetriever.ts (ChromaDB).
 *
 * Chunking strategy:
 * - Code files (TS/JS/Python/Java/Go/Rust/…): split at top-level
 *   function / class / method boundaries so each chunk is a logical unit.
 * - All other files: sliding-window with configurable overlap.
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, extname, relative } from 'path';

export interface CodeChunk {
  id: string;
  filePath: string;
  relativePath: string;
  content: string;
  startLine: number;
  endLine: number;
  language: string;
  /** Term frequencies used by BM25 retrieval */
  termFrequencies: Map<string, number>;
  /** Total token count for BM25 document-length normalization */
  tokenCount: number;
}

export interface IndexedProject {
  rootPath: string;
  chunks: CodeChunk[];
  fileTree: string;
  totalFiles: number;
  totalChunks: number;
  indexedAt: Date;
}

// Files/dirs to skip
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'dist-electron', '.vite',
  '__pycache__', '.next', '.cache', 'coverage', '.temp',
  'build', '.svn', '.hg', 'vendor',
]);

const IGNORED_FILES = new Set([
  '.DS_Store', 'Thumbs.db', 'package-lock.json', 'pnpm-lock.yaml',
  'yarn.lock', '.env', '.env.local',
]);

// Only index text-based files
const INDEXABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.c', '.cpp', '.h', '.hpp',
  '.go', '.rs', '.rb', '.php', '.swift', '.kt',
  '.css', '.scss', '.less', '.html', '.vue', '.svelte',
  '.json', '.yaml', '.yml', '.toml', '.xml',
  '.md', '.txt', '.sh', '.bash', '.zsh',
  '.sql', '.graphql', '.prisma',
  '.env.example', '.gitignore', '.dockerignore',
  'Dockerfile', 'Makefile',
]);

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
  '.mjs': 'javascript', '.cjs': 'javascript', '.py': 'python', '.java': 'java',
  '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp', '.go': 'go', '.rs': 'rust',
  '.rb': 'ruby', '.php': 'php', '.swift': 'swift', '.kt': 'kotlin',
  '.css': 'css', '.scss': 'scss', '.less': 'less', '.html': 'html',
  '.vue': 'vue', '.svelte': 'svelte', '.json': 'json', '.yaml': 'yaml',
  '.yml': 'yaml', '.toml': 'toml', '.xml': 'xml', '.md': 'markdown',
  '.sql': 'sql', '.graphql': 'graphql', '.prisma': 'prisma',
  '.sh': 'bash', '.bash': 'bash', '.zsh': 'zsh',
};

// Chunk settings for sliding-window (non-code) files
const CHUNK_SIZE = 50;       // lines per chunk
const CHUNK_OVERLAP = 10;    // overlap lines between chunks
const MAX_FILE_SIZE = 100_000; // skip files larger than 100 KB

// Languages that support structure-aware (function/class) chunking
const STRUCTURE_AWARE_LANGUAGES = new Set([
  'typescript', 'javascript', 'python', 'java', 'go', 'rust',
  'cpp', 'c', 'ruby', 'php', 'swift', 'kotlin',
]);

/**
 * Tokenize text into normalized terms.
 * Splits camelCase / PascalCase / snake_case so that identifiers
 * like `getUserById` contribute tokens: `get`, `user`, `by`, `id`.
 */
export function tokenize(text: string): string[] {
  // Insert spaces before uppercase letters (camelCase / PascalCase split)
  const expanded = text.replace(/([a-z])([A-Z])/g, '$1 $2');
  return expanded
    .toLowerCase()
    .replace(/[^a-z0-9_$]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && t.length < 50);
}

/**
 * Calculate term frequencies for a text.
 * Returns both the frequency map and the total token count.
 */
export function calculateTermFrequencies(text: string): { freq: Map<string, number>; tokenCount: number } {
  const tokens = tokenize(text);
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }
  return { freq, tokenCount: tokens.length };
}

/** Build a tree-view string of the project structure */
async function buildFileTreeString(dirPath: string, rootPath: string, prefix = ''): Promise<string> {
  let result = '';
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const filtered = entries
      .filter(e => !IGNORED_DIRS.has(e.name) && !IGNORED_FILES.has(e.name))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    for (let i = 0; i < filtered.length; i++) {
      const entry = filtered[i];
      const isLast = i === filtered.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = isLast ? '    ' : '│   ';

      if (entry.isDirectory()) {
        result += `${prefix}${connector}${entry.name}/\n`;
        const subtree = await buildFileTreeString(
          join(dirPath, entry.name), rootPath, prefix + childPrefix,
        );
        result += subtree;
      } else {
        result += `${prefix}${connector}${entry.name}\n`;
      }
    }
  } catch {
    // Permission denied or other error, skip
  }
  return result;
}

/** Top-level declaration patterns used for structure-aware chunking */
const STRUCTURE_PATTERNS: Record<string, RegExp> = {
  typescript:  /^\s*(export\s+)?(async\s+)?(function|class|const|let|var|interface|type|enum|abstract\s+class)\s+\w/,
  javascript:  /^\s*(export\s+)?(async\s+)?(function|class|const|let|var)\s+\w/,
  python:      /^(def |class |async def )\w/,
  java:        /^\s*(public|private|protected|static|final|abstract)(\s+\w+)*\s+(class|interface|enum|\w+\s*\()/,
  go:          /^func\s/,
  rust:        /^(pub\s+)?(fn |struct |impl |enum |trait )\w/,
  cpp:         /^\w[\w:<>*&\s]+\s+\w+\s*\(/,
  c:           /^\w[\w*\s]+\s+\w+\s*\(/,
  ruby:        /^\s*(def |class |module )\w/,
  php:         /^\s*(function |class |interface |trait )\w/,
  swift:       /^\s*(func |class |struct |enum |protocol )\w/,
  kotlin:      /^\s*(fun |class |data class |object |interface )\w/,
};

/**
 * Sliding-window chunking (used for non-code files and as fallback).
 * @param lineOffset - absolute line offset when called for a sub-chunk
 */
function chunkBySlidingWindow(
  lines: string[],
  filePath: string,
  relativePath: string,
  language: string,
  lineOffset = 0,
): CodeChunk[] {
  const chunks: CodeChunk[] = [];

  if (lines.length <= CHUNK_SIZE) {
    const content = lines.join('\n');
    const { freq, tokenCount } = calculateTermFrequencies(content);
    chunks.push({
      id: `${relativePath}:${lineOffset + 1}-${lineOffset + lines.length}`,
      filePath,
      relativePath,
      content,
      startLine: lineOffset + 1,
      endLine: lineOffset + lines.length,
      language,
      termFrequencies: freq,
      tokenCount,
    });
    return chunks;
  }

  for (let start = 0; start < lines.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
    const end = Math.min(start + CHUNK_SIZE, lines.length);
    const chunkContent = lines.slice(start, end).join('\n');
    const { freq, tokenCount } = calculateTermFrequencies(chunkContent);
    chunks.push({
      id: `${relativePath}:${lineOffset + start + 1}-${lineOffset + end}`,
      filePath,
      relativePath,
      content: chunkContent,
      startLine: lineOffset + start + 1,
      endLine: lineOffset + end,
      language,
      termFrequencies: freq,
      tokenCount,
    });
    if (end >= lines.length) break;
  }

  return chunks;
}

/**
 * Structure-aware chunking: split at top-level function / class boundaries.
 * Falls back to sliding-window for files without recognisable boundaries.
 */
function chunkByStructure(
  lines: string[],
  filePath: string,
  relativePath: string,
  language: string,
): CodeChunk[] {
  const pattern = STRUCTURE_PATTERNS[language];
  const chunks: CodeChunk[] = [];

  const boundaries: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      boundaries.push(i);
    }
  }

  if (boundaries.length < 2) {
    return chunkBySlidingWindow(lines, filePath, relativePath, language);
  }

  for (let b = 0; b < boundaries.length; b++) {
    const start = boundaries[b];
    const end = b + 1 < boundaries.length ? boundaries[b + 1] : lines.length;
    const chunkLines = lines.slice(start, end);

    if (chunkLines.length > CHUNK_SIZE * 2) {
      const subChunks = chunkBySlidingWindow(
        chunkLines, filePath, relativePath, language, start,
      );
      chunks.push(...subChunks);
    } else {
      const content = chunkLines.join('\n');
      const { freq, tokenCount } = calculateTermFrequencies(content);
      chunks.push({
        id: `${relativePath}:${start + 1}-${end}`,
        filePath,
        relativePath,
        content,
        startLine: start + 1,
        endLine: end,
        language,
        termFrequencies: freq,
        tokenCount,
      });
    }
  }

  return chunks;
}

/** Chunk a single file using structure-aware or sliding-window strategy */
function chunkFile(content: string, filePath: string, relativePath: string): CodeChunk[] {
  const lines = content.split('\n');
  const ext = extname(filePath).toLowerCase();
  const language = LANGUAGE_MAP[ext] || 'text';

  if (STRUCTURE_AWARE_LANGUAGES.has(language)) {
    return chunkByStructure(lines, filePath, relativePath, language);
  }
  return chunkBySlidingWindow(lines, filePath, relativePath, language);
}

async function collectFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          const subFiles = await collectFiles(fullPath);
          files.push(...subFiles);
        }
      } else {
        if (IGNORED_FILES.has(entry.name)) continue;
        const ext = extname(entry.name).toLowerCase();
        if (ext && !INDEXABLE_EXTENSIONS.has(ext)) continue;
        if (!ext && !INDEXABLE_EXTENSIONS.has(entry.name)) continue;
        files.push(fullPath);
      }
    }
  } catch {
    // Skip inaccessible directories
  }
  return files;
}

// In-memory project index (module-level singleton)
let currentIndex: IndexedProject | null = null;

/** Index an entire project directory */
export async function indexProject(rootPath: string): Promise<IndexedProject> {
  console.log(`📂 Indexing project: ${rootPath}`);
  const startTime = Date.now();

  const filePaths = await collectFiles(rootPath);
  const allChunks: CodeChunk[] = [];
  let totalFiles = 0;

  for (const filePath of filePaths) {
    try {
      const fileStat = await stat(filePath);
      if (fileStat.size > MAX_FILE_SIZE) continue;

      const content = await readFile(filePath, 'utf-8');
      const relativePath = relative(rootPath, filePath).replace(/\\/g, '/');
      const chunks = chunkFile(content, filePath, relativePath);
      allChunks.push(...chunks);
      totalFiles++;
    } catch {
      // Skip unreadable files
    }
  }

  const fileTree = await buildFileTreeString(rootPath, rootPath);

  currentIndex = {
    rootPath,
    chunks: allChunks,
    fileTree,
    totalFiles,
    totalChunks: allChunks.length,
    indexedAt: new Date(),
  };

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ Indexed ${totalFiles} files → ${allChunks.length} chunks (${elapsed}s)`);

  return currentIndex;
}

/** Get the current index (or null if not indexed) */
export function getIndex(): IndexedProject | null {
  return currentIndex;
}

/** Clear the current index */
export function clearIndex(): void {
  currentIndex = null;
}
