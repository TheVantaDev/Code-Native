/**
 * fileWatcher.ts — Incremental Workspace Re-Indexer
 *
 * Watches the workspace root for file changes and incrementally
 * updates the BM25 index without requiring a full re-index.
 *
 * Strategy:
 *   - Use fs.watch() recursively on the workspace root
 *   - Debounce changes per-file (500ms)
 *   - On change: remove old chunks for that file, re-parse + re-add
 *   - Ignore node_modules, .git, dist, etc.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getIndex, chunkFile, CodeChunk } from './fileIndexer';

// Directories to ignore in the watcher
const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'dist-electron', '.vite',
  '__pycache__', '.next', '.cache', 'coverage', '.temp',
  'build', '.svn', '.hg', 'vendor', 'out',
]);

// Extensions we care about
const WATCHABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.c', '.cpp', '.h', '.hpp',
  '.go', '.rs', '.rb', '.php', '.swift', '.kt',
  '.css', '.scss', '.less', '.html', '.vue', '.svelte',
  '.json', '.yaml', '.yml', '.toml', '.md', '.txt', '.sh',
]);

// Per-file debounce timers
const _debounceTimers = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 500;

let _watcher: fs.FSWatcher | null = null;
let _watchedRoot: string = '';
let _onChangeCallback: (() => void) | null = null;

/**
 * Start watching the workspace root for file changes.
 * Calls onIndexUpdated() after each incremental re-index.
 *
 * Safe to call multiple times — stops previous watcher first.
 */
export function startFileWatcher(
  workspaceRoot: string,
  onIndexUpdated?: () => void,
): void {
  // Stop existing watcher
  stopFileWatcher();

  if (!workspaceRoot || !fs.existsSync(workspaceRoot)) {
    console.warn(`[FileWatcher] Root not found: ${workspaceRoot}`);
    return;
  }

  _watchedRoot = workspaceRoot;
  _onChangeCallback = onIndexUpdated || null;

  try {
    _watcher = fs.watch(workspaceRoot, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      const fullPath = path.join(workspaceRoot, filename);

      // Ignore files in ignored directories
      const parts = filename.split(/[\\/]/);
      if (parts.some(p => IGNORE_DIRS.has(p))) return;

      // Only watch relevant file extensions
      const ext = path.extname(filename).toLowerCase();
      if (ext && !WATCHABLE_EXTENSIONS.has(ext)) return;

      // Debounce per file
      const existing = _debounceTimers.get(fullPath);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        _debounceTimers.delete(fullPath);
        handleFileChange(fullPath, workspaceRoot);
      }, DEBOUNCE_MS);

      _debounceTimers.set(fullPath, timer);
    });

    _watcher.on('error', (err) => {
      console.warn(`[FileWatcher] Watch error:`, err);
    });

    console.log(`[FileWatcher] Watching: ${workspaceRoot}`);
  } catch (err) {
    console.warn(`[FileWatcher] Failed to start:`, err);
  }
}

/**
 * Stop the active file watcher.
 */
export function stopFileWatcher(): void {
  if (_watcher) {
    _watcher.close();
    _watcher = null;
  }
  // Clear all pending debounce timers
  for (const timer of _debounceTimers.values()) {
    clearTimeout(timer);
  }
  _debounceTimers.clear();
  _watchedRoot = '';
}

/**
 * Handle a single file change — update its chunks in the in-memory index.
 */
async function handleFileChange(fullPath: string, workspaceRoot: string): Promise<void> {
  const index = getIndex();
  if (!index) return; // Index not built yet

  const relativePath = path.relative(workspaceRoot, fullPath).replace(/\\/g, '/');

  try {
    // Remove old chunks for this file
    const before = index.chunks.length;
    index.chunks = index.chunks.filter(chunk => chunk.filePath !== fullPath);
    const removed = before - index.chunks.length;

    if (fs.existsSync(fullPath)) {
      // Re-parse the file
      const stat = fs.statSync(fullPath);
      if (stat.size > 100_000) return; // Skip large files

      const content = fs.readFileSync(fullPath, 'utf-8');
      const newChunks: CodeChunk[] = chunkFile(content, fullPath, relativePath);
      index.chunks.push(...newChunks);

      console.log(`[FileWatcher] Re-indexed ${relativePath}: removed ${removed} chunks, added ${newChunks.length}`);
    } else {
      // File was deleted
      console.log(`[FileWatcher] File deleted: ${relativePath}, removed ${removed} chunks`);
    }

    // Update totals
    index.totalChunks = index.chunks.length;

    // Notify caller
    _onChangeCallback?.();

  } catch (err) {
    console.warn(`[FileWatcher] Error re-indexing ${relativePath}:`, err);
  }
}

/** Whether the watcher is active */
export function isWatcherActive(): boolean {
  return _watcher !== null;
}
