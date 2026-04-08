/**
 * fileIndexer.ts — Project File Indexer for RAG
 * 
 * Recursively reads a project directory and chunks files into
 * searchable segments. These chunks are stored in memory and
 * used by contextRetriever.ts to find relevant code for AI queries.
 * 
 * Designed for easy swap: when vector DB is ready, just feed
 * these chunks to the embedding pipeline instead of keeping in memory.
 * 
 * @author CodeNative Team
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, extname, relative } from 'path';
import { addChunksToChroma, clearChromaCollection } from './chroma';

export interface CodeChunk {
    id: string;
    filePath: string;
    relativePath: string;
    content: string;
    startLine: number;
    endLine: number;
    language: string;
    /** TF-IDF term frequencies (populated during indexing) */
    termFrequencies: Map<string, number>;
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

// Chunk settings
const CHUNK_SIZE = 50;       // lines per chunk
const CHUNK_OVERLAP = 10;    // overlap lines between chunks
const MAX_FILE_SIZE = 100_000; // skip files larger than 100KB

/**
 * Tokenize text into normalized terms for TF-IDF
 */
function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9_$]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 1 && t.length < 50);
}

/**
 * Calculate term frequencies for a text
 */
function calculateTermFrequencies(text: string): Map<string, number> {
    const tokens = tokenize(text);
    const freq = new Map<string, number>();
    for (const token of tokens) {
        freq.set(token, (freq.get(token) || 0) + 1);
    }
    return freq;
}

/**
 * Build a tree-view string of the project structure
 */
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
                    join(dirPath, entry.name), rootPath, prefix + childPrefix
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

/**
 * Index a single file into chunks
 */
function chunkFile(content: string, filePath: string, relativePath: string): CodeChunk[] {
    const lines = content.split('\n');
    const ext = extname(filePath).toLowerCase();
    const language = LANGUAGE_MAP[ext] || 'text';
    const chunks: CodeChunk[] = [];

    // Small files: single chunk
    if (lines.length <= CHUNK_SIZE) {
        chunks.push({
            id: `${relativePath}:0-${lines.length}`,
            filePath,
            relativePath,
            content,
            startLine: 1,
            endLine: lines.length,
            language,
            termFrequencies: calculateTermFrequencies(content),
        });
        return chunks;
    }

    // Larger files: sliding window chunks
    for (let start = 0; start < lines.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
        const end = Math.min(start + CHUNK_SIZE, lines.length);
        const chunkContent = lines.slice(start, end).join('\n');

        chunks.push({
            id: `${relativePath}:${start + 1}-${end}`,
            filePath,
            relativePath,
            content: chunkContent,
            startLine: start + 1,
            endLine: end,
            language,
            termFrequencies: calculateTermFrequencies(chunkContent),
        });

        if (end >= lines.length) break;
    }

    return chunks;
}

/**
 * Recursively collect all indexable file paths
 */
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
                // Allow extensionless files like Dockerfile, Makefile
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

// In-memory project index
let currentIndex: IndexedProject | null = null;

/**
 * Index an entire project directory
 */
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

    // Build file tree string
    const fileTree = await buildFileTreeString(rootPath, rootPath);

    currentIndex = {
        rootPath,
        chunks: allChunks,
        fileTree,
        totalFiles,
        totalChunks: allChunks.length,
        indexedAt: new Date(),
    };

    // Add chunks to ChromaDB
    try {
        await addChunksToChroma(allChunks);
    } catch (e) {
        console.error("Failed to seed vector DB:", e);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Indexed ${totalFiles} files → ${allChunks.length} chunks (${elapsed}s)`);

    return currentIndex;
}

/**
 * Get the current index (or null if not indexed)
 */
export function getIndex(): IndexedProject | null {
    return currentIndex;
}

/**
 * Check if a project is currently indexed
 */
export function isIndexed(): boolean {
    return currentIndex !== null;
}

/**
 * Clear the current index
 */
export function clearIndex(): void {
    currentIndex = null;
    clearChromaCollection().catch(e => console.error("Failed to clear chroma", e));
}

export { calculateTermFrequencies, tokenize };
