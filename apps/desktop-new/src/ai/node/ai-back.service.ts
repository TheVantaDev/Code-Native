import { Autowired, Injectable } from '@opensumi/di';
import { IAIBackService, IAICompletionOption, IAIBackServiceOption } from '@opensumi/ide-core-common';
import { CancellationToken, INodeLogger } from '@opensumi/ide-core-node';
import { BaseAIBackService, ChatReadableStream } from '@opensumi/ide-core-node/lib/ai-native/base-back.service';
import { ILogServiceManager } from '@opensumi/ide-logs';
import * as fs from 'fs';
import * as path from 'path';

import { IModelConfig } from '../common'

// Talk directly to Ollama — no Express backend dependency
const OLLAMA_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'qwen2.5-coder:7b';

// ======================== HELPER UTILITIES ========================

/** Decode common HTML entities that models sometimes produce */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#x60;/g, '`')
    .replace(/&#x3D;/g, '=');
}

/** Normalise a file path from model output (strip file:// prefix, fix slashes) */
function cleanFilePath(rawPath: string): string {
  let p = rawPath.trim();
  p = p.replace(/^file:\/\/\/?/, '');
  p = decodeURIComponent(p);
  if (path.sep === '\\') p = p.replace(/\//g, '\\');
  return p;
}

// ======================== TOOL DEFINITIONS ========================

// System-message tool format (Continue.dev style) for models that embed tool calls in text.
// Ollama native tool format is also sent; whichever the model uses will work.
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'create_file',
      description: 'Create a new file or completely overwrite an existing file. This is the PREFERRED way to write files.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute OS file path' },
          content:   { type: 'string', description: 'Complete file content to write' },
        },
        required: ['file_path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read file contents. Call this before editing.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute OS file path to read' },
        },
        required: ['file_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_and_replace',
      description: 'Replace a text snippet in a file. find_text must be an EXACT substring of the file. If it fails, use create_file with the full updated content.',
      parameters: {
        type: 'object',
        properties: {
          file_path:    { type: 'string', description: 'Absolute OS file path' },
          find_text:    { type: 'string', description: 'Exact current text to find' },
          replace_text: { type: 'string', description: 'New text to replace it with' },
        },
        required: ['file_path', 'find_text', 'replace_text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and directories at a path.',
      parameters: {
        type: 'object',
        properties: {
          dir_path:  { type: 'string', description: 'Absolute OS directory path' },
          recursive: { type: 'boolean', description: 'List recursively (max 3 levels). Default false.' },
        },
        required: ['dir_path'],
      },
    },
  },
];

// All recognized tool names for parsing
const ALL_TOOL_NAMES = ['create_file', 'create_new_file', 'read_file', 'find_and_replace', 'edit_existing_file', 'list_files'];

/** Normalize legacy tool names to current names */
function normalizeToolName(name: string): string {
  if (name === 'create_new_file') return 'create_file';
  if (name === 'edit_existing_file') return 'find_and_replace';
  return name;
}

// ======================== TOOL EXECUTION ========================

/** Track recently executed tool calls to prevent duplicates within a session */
const _recentToolCalls: string[] = [];
const MAX_RECENT = 20;

function isDuplicateToolCall(name: string, args: Record<string, any>): boolean {
  const key = `${name}:${args.file_path || args.dir_path || ''}:${(args.content || '').slice(0, 100)}`;
  if (_recentToolCalls.includes(key)) return true;
  _recentToolCalls.push(key);
  if (_recentToolCalls.length > MAX_RECENT) _recentToolCalls.shift();
  return false;
}

function clearToolCallHistory() {
  _recentToolCalls.length = 0;
}

function executeToolCall(rawName: string, args: Record<string, any>): string {
  const name = normalizeToolName(rawName);

  // Decode HTML entities in ALL string fields (model sometimes generates &quot; etc)
  const decodedArgs: Record<string, any> = {};
  for (const [key, value] of Object.entries(args)) {
    decodedArgs[key] = typeof value === 'string' ? decodeHtmlEntities(value) : value;
  }

  // Dedup guard: skip duplicate tool calls (same tool + same file + same content start)
  if (isDuplicateToolCall(name, decodedArgs)) {
    console.log(`[CodeNative AI] Skipping duplicate tool call: ${name}`);
    return `[Tool skipped: duplicate call to ${name}]`;
  }

  try {
    if (name === 'create_file') {
      const filePath = cleanFilePath(decodedArgs.file_path || decodedArgs.path || '');
      const content = decodedArgs.content || '';
      if (!filePath) return '[Tool error: No file_path provided]';

      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
      return `[Done: wrote ${filePath} (${content.split('\n').length} lines)]`;
    }

    if (name === 'read_file') {
      const filePath = cleanFilePath(decodedArgs.file_path || decodedArgs.path || '');
      if (!filePath) return '[Tool error: No file_path provided]';
      if (!fs.existsSync(filePath)) return `[Tool error: File not found: ${filePath}]`;

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const numbered = lines.map((line, i) => `${i + 1}| ${line}`).join('\n');
      const truncated = numbered.length > 8000
        ? numbered.substring(0, 8000) + '\n...(truncated)'
        : numbered;
      return `[Contents of ${filePath} — ${lines.length} lines]\n${truncated}`;
    }

    if (name === 'find_and_replace') {
      const filePath = cleanFilePath(decodedArgs.file_path || decodedArgs.path || '');
      const findText = decodedArgs.find_text || decodedArgs.old_text || decodedArgs.search || '';
      const replaceText = decodedArgs.replace_text || decodedArgs.new_text || decodedArgs.replacement || '';
      if (!filePath) return '[Tool error: No file_path provided]';
      if (!fs.existsSync(filePath)) return `[Tool error: File not found: ${filePath}]`;
      if (!findText) return '[Tool error: No find_text provided]';

      const currentContent = fs.readFileSync(filePath, 'utf-8');

      // Ambiguity check (Continue.dev pattern): if find_text matches multiple locations, reject
      const matchCount = currentContent.split(findText).length - 1;
      if (matchCount > 1) {
        return `[Tool error: find_text matches ${matchCount} locations in ${filePath}. Provide a larger/more unique text snippet, or use create_file with the complete updated content.]`;
      }

      // Strategy 1: Exact substring match
      if (matchCount === 1) {
        const newContent = currentContent.replace(findText, replaceText);
        fs.writeFileSync(filePath, newContent, 'utf-8');
        return `[Done: edited ${filePath}]`;
      }

      // Strategy 2: Trimmed match
      const trimmedFind = findText.trim();
      if (trimmedFind && currentContent.includes(trimmedFind)) {
        const newContent = currentContent.replace(trimmedFind, replaceText.trim());
        fs.writeFileSync(filePath, newContent, 'utf-8');
        return `[Done: edited ${filePath} (trimmed match)]`;
      }

      // Strategy 3: Whitespace-normalized match
      const normalizeWs = (s: string) => s.replace(/[ \t]+/g, ' ');
      const normalizedContent = normalizeWs(currentContent);
      const normalizedFind = normalizeWs(findText);
      if (normalizedFind && normalizedContent.includes(normalizedFind)) {
        const contentLines = currentContent.split('\n');
        const findLines = findText.split('\n');
        for (let i = 0; i <= contentLines.length - findLines.length; i++) {
          const slice = contentLines.slice(i, i + findLines.length).join('\n');
          if (normalizeWs(slice) === normalizedFind) {
            const newContent = currentContent.replace(slice, replaceText);
            fs.writeFileSync(filePath, newContent, 'utf-8');
            return `[Done: edited ${filePath} (normalized match)]`;
          }
        }
      }

      return `[Tool error: Text not found in ${filePath}. Use create_file with the complete updated file content instead.]`;
    }

    if (name === 'list_files') {
      const dirPath = cleanFilePath(decodedArgs.dir_path || decodedArgs.path || '');
      const recursive = decodedArgs.recursive === true;
      if (!dirPath) return '[Tool error: No dir_path provided]';
      if (!fs.existsSync(dirPath)) return `[Tool error: Directory not found: ${dirPath}]`;

      const IGNORE_DIRS = new Set([
        'node_modules', '.git', 'out', 'build', 'dist', 'target',
        '.cache', '.next', '__pycache__', '.vscode', '.idea',
      ]);

      const entries: string[] = [];
      const maxEntries = 200;

      function listDir(dir: string, prefix: string, depth: number) {
        if (entries.length >= maxEntries) return;
        try {
          const items = fs.readdirSync(dir, { withFileTypes: true })
            .sort((a, b) => {
              if (a.isDirectory() && !b.isDirectory()) return -1;
              if (!a.isDirectory() && b.isDirectory()) return 1;
              return a.name.localeCompare(b.name);
            });
          for (const item of items) {
            if (entries.length >= maxEntries) break;
            if (item.isDirectory()) {
              if (IGNORE_DIRS.has(item.name)) continue;
              entries.push(`${prefix}${item.name}/`);
              if (recursive && depth < 3) {
                listDir(path.join(dir, item.name), prefix + '  ', depth + 1);
              }
            } else {
              entries.push(`${prefix}${item.name}`);
            }
          }
        } catch { /* skip unreadable dirs */ }
      }

      listDir(dirPath, '', 0);
      const suffix = entries.length >= maxEntries ? '\n...(truncated)' : '';
      return `[Contents of ${dirPath}]\n${entries.join('\n')}${suffix}`;
    }

    return `[Tool error: Unknown tool "${name}"]`;
  } catch (err: any) {
    return `[Tool error: ${err.message || String(err)}]`;
  }
}

// ======================== RAG: TF-IDF WORKSPACE INDEXER ========================

interface CodeChunk {
  id: string;
  filePath: string;
  relativePath: string;
  content: string;
  startLine: number;
  endLine: number;
  termFrequencies: Map<string, number>;
}

interface WorkspaceIndex {
  chunks: CodeChunk[];
  fileTree: string;
  totalFiles: number;
}

const CHUNK_SIZE = 50;       // lines per chunk
const CHUNK_OVERLAP = 10;    // overlap between chunks

/** Tokenize text into normalized terms for TF-IDF */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_$]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && t.length < 50);
}

/** Calculate term frequencies for a text */
function calcTF(text: string): Map<string, number> {
  const tokens = tokenize(text);
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }
  return freq;
}

/** Calculate IDF for all terms in the corpus */
function calcIDF(chunks: CodeChunk[]): Map<string, number> {
  const n = chunks.length;
  const docFreq = new Map<string, number>();
  for (const chunk of chunks) {
    const seen = new Set(chunk.termFrequencies.keys());
    for (const term of seen) {
      docFreq.set(term, (docFreq.get(term) || 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const [term, df] of docFreq) {
    idf.set(term, Math.log(n / df));
  }
  return idf;
}

/** Build an in-memory TF-IDF index of all source files in a workspace */
function buildWorkspaceIndex(rootDir: string, maxDepth = 6): WorkspaceIndex {
  const IGNORE_DIRS = new Set([
    'node_modules', '.git', 'out', 'build', 'dist', 'target',
    '.cache', '.next', '__pycache__', '.vscode', '.idea', '.gradle',
  ]);
  const CODE_EXTENSIONS = new Set([
    '.java', '.ts', '.tsx', '.js', '.jsx', '.py', '.c', '.cpp', '.h',
    '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala',
    '.html', '.css', '.scss', '.less', '.json', '.xml', '.yaml', '.yml',
    '.md', '.txt', '.sql', '.sh', '.bat', '.ps1', '.dockerfile',
    '.vue', '.svelte', '.prisma', '.graphql', '.toml',
  ]);

  const chunks: CodeChunk[] = [];
  const treeParts: string[] = [];
  let totalFiles = 0;

  function walk(dir: string, depth: number, prefix: string) {
    if (depth > maxDepth) return;
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const isLast = i === items.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? '    ' : '│   ';

        if (item.isDirectory()) {
          if (IGNORE_DIRS.has(item.name)) continue;
          treeParts.push(`${prefix}${connector}${item.name}/`);
          walk(path.join(dir, item.name), depth + 1, prefix + childPrefix);
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          treeParts.push(`${prefix}${connector}${item.name}`);

          if (!CODE_EXTENSIONS.has(ext)) continue;

          const fullPath = path.join(dir, item.name);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.size > 100_000) continue;

            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
            totalFiles++;

            // Chunk the file with sliding window
            if (lines.length <= CHUNK_SIZE) {
              chunks.push({
                id: `${relativePath}:1-${lines.length}`,
                filePath: fullPath,
                relativePath,
                content,
                startLine: 1,
                endLine: lines.length,
                termFrequencies: calcTF(content),
              });
            } else {
              for (let start = 0; start < lines.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
                const end = Math.min(start + CHUNK_SIZE, lines.length);
                const chunkContent = lines.slice(start, end).join('\n');
                chunks.push({
                  id: `${relativePath}:${start + 1}-${end}`,
                  filePath: fullPath,
                  relativePath,
                  content: chunkContent,
                  startLine: start + 1,
                  endLine: end,
                  termFrequencies: calcTF(chunkContent),
                });
                if (end >= lines.length) break;
              }
            }
          } catch { /* skip unreadable files */ }
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  walk(rootDir, 0, '');
  return { chunks, fileTree: treeParts.join('\n'), totalFiles };
}

/** TF-IDF retrieval: find top-K relevant chunks for a query */
function retrieveChunks(index: WorkspaceIndex, query: string, topK = 5): CodeChunk[] {
  if (index.chunks.length === 0) return [];

  const queryTF = calcTF(query);
  const idf = calcIDF(index.chunks);

  const scored = index.chunks.map(chunk => {
    let score = 0;
    for (const [term, qFreq] of queryTF) {
      const cFreq = chunk.termFrequencies.get(term) || 0;
      const termIdf = idf.get(term) || 0;
      score += qFreq * cFreq * termIdf * termIdf;
    }

    // Filename boost
    const queryLower = query.toLowerCase();
    const fileName = chunk.relativePath.split('/').pop()?.toLowerCase() || '';
    if (queryLower.includes(fileName)) score += 10;
    for (const part of chunk.relativePath.toLowerCase().split('/')) {
      if (part.length > 2 && queryLower.includes(part)) score += 3;
    }

    return { chunk, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => s.chunk);
}

/** Search workspace for a specific bare filename (DFS) */
function findFileInWorkspace(rootDir: string, fileName: string, maxDepth = 5, depth = 0): string | null {
  if (depth > maxDepth) return null;
  const IGNORE_DIRS = ['node_modules', '.git', 'out', 'build', 'dist', 'target'];
  try {
    const items = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory()) {
        if (IGNORE_DIRS.includes(item.name)) continue;
        const found = findFileInWorkspace(path.join(rootDir, item.name), fileName, maxDepth, depth + 1);
        if (found) return found;
      } else if (item.name.toLowerCase() === fileName.toLowerCase()) {
        return path.join(rootDir, item.name);
      }
    }
  } catch { }
  return null;
}

// ======================== AI BACK SERVICE ========================

@Injectable()
export class AIBackService extends BaseAIBackService implements IAIBackService {
  @Autowired(ILogServiceManager)
  private readonly loggerManager: ILogServiceManager;

  // Lazy logger to avoid accessing loggerManager before DI injects it
  private _logger: INodeLogger | undefined;
  private get logger(): INodeLogger {
    if (!this._logger) {
      this._logger = this.loggerManager.getLogger('ai' as any);
    }
    return this._logger;
  }

  // ===== Model Config =====
  private _config: IModelConfig | undefined;
  private _cachedFirstModel: string | undefined;

  // ===== RAG: In-Memory Workspace Index =====
  private _workspaceIndex: WorkspaceIndex = { chunks: [], fileTree: '', totalFiles: 0 };
  private _workspaceRoot: string = '';
  private _indexBuilt = false;

  setModelConfig(config: IModelConfig): void {
    this._config = config;
    this.logger.log('[model config updated] model:', config.codeModelName || '(auto)');
  }

  /** Set the workspace root directory (called from contribution) */
  setWorkspaceRoot(dir: string): void {
    let cleanDir = dir;
    if (cleanDir.startsWith('file:///')) {
      cleanDir = cleanDir.replace('file:///', '');
      cleanDir = decodeURIComponent(cleanDir);
      if (path.sep === '\\') cleanDir = cleanDir.replace(/\//g, '\\');
    }

    // Skip if same root already set and indexed
    if (cleanDir === this._workspaceRoot && this._indexBuilt) {
      console.log(`[CodeNative AI] Workspace root unchanged, skipping re-index: ${cleanDir}`);
      return;
    }

    this._workspaceRoot = cleanDir;
    this._indexBuilt = false;
    console.log(`[CodeNative AI] Workspace root set to: ${cleanDir}`);

    // Build index asynchronously
    setTimeout(() => {
      console.log(`[CodeNative AI] Building workspace index (TF-IDF)...`);
      this._workspaceIndex = buildWorkspaceIndex(cleanDir);
      this._indexBuilt = true;
      console.log(`[CodeNative AI] Workspace index built: ${this._workspaceIndex.totalFiles} files, ${this._workspaceIndex.chunks.length} chunks`);
      // Log first few files from the tree so we can verify
      const firstFiles = this._workspaceIndex.fileTree.split('\n').slice(0, 10).join('\n');
      console.log(`[CodeNative AI] File tree preview:\n${firstFiles}`);
    }, 1000);
  }

  private get modelConfig(): IModelConfig | undefined {
    const config = this._config;
    if (!config) return;
    return {
      ...config,
      codeTemperature: this.coerceNumber(config.codeTemperature, 0, 1, 0.2),
      codePresencePenalty: this.coerceNumber(config.codePresencePenalty, -2, 2, 1),
      codeFrequencyPenalty: this.coerceNumber(config.codeFrequencyPenalty, -2, 2, 1),
      codeTopP: this.coerceNumber(config.codeTopP, 0, 1, 0.95),
    };
  }

  private get modelName(): string {
    const configModel = this.modelConfig?.codeModelName;
    return configModel || this._cachedFirstModel || DEFAULT_MODEL;
  }

  private coerceNumber(value: string | number, min: number, max: number, defaultValue: number) {
    const num = Number(value);
    if (isNaN(num)) return defaultValue;
    if (num < min || num > max) return defaultValue;
    return num;
  }

  // ======================== HEALTH & MODELS ========================

  async checkOllamaStatus(): Promise<boolean> {
    try {
      const response = await fetch(OLLAMA_URL, { method: 'GET', signal: AbortSignal.timeout(5000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getOllamaModels(): Promise<string[]> {
    try {
      const response = await fetch(`${OLLAMA_URL}/api/tags`, { method: 'GET', signal: AbortSignal.timeout(5000) });
      if (!response.ok) return [];
      const result = await response.json() as { models: { name: string }[] };
      if (Array.isArray(result.models)) {
        const names = result.models.map(m => m.name);
        if (names.length > 0 && !this._cachedFirstModel) this._cachedFirstModel = names[0];
        return names;
      }
      return [];
    } catch {
      return [];
    }
  }

  // ======================== REQUEST (Non-Streaming) ========================

  override async request(input: string, options: IAIBackServiceOption, cancelToken?: CancellationToken) {
    const model = this.modelName;
    try {
      const controller = new AbortController();
      cancelToken?.onCancellationRequested(() => controller.abort());

      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: input }],
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`Ollama request failed: ${response.status}`);
      const result = await response.json() as { message?: { content?: string } };
      return { data: result.message?.content || '' };
    } catch (error: any) {
      if (error.name === 'AbortError') return { data: '' };
      this.logger.error('Ollama request error:', error);
      return { errorCode: error.message || 'Unknown error' };
    }
  }

  // ======================== REQUEST STREAM ========================

  override async requestStream(input: string, options: IAIBackServiceOption, cancelToken?: CancellationToken) {
    const chatReadableStream = new ChatReadableStream();
    cancelToken?.onCancellationRequested(() => chatReadableStream.abort());
    this.streamFromOllama(input, chatReadableStream, options, cancelToken);
    return chatReadableStream;
  }

  // ======================== CORE: streamFromOllama ========================

  private async streamFromOllama(
    input: string,
    stream: ChatReadableStream,
    options: IAIBackServiceOption,
    cancelToken?: CancellationToken,
  ) {
    const model = this.modelName;
    const isNoTool = (options as any).noTool === true;
    const config = this.modelConfig;

    // Clear dedup history for each new request
    clearToolCallHistory();

    try {
      const messages: Array<{ role: string; content: string }> = [];

      // ===== SYSTEM PROMPT =====
      const workspaceInfo = this._workspaceRoot ? `\nWorkspace: ${this._workspaceRoot}` : '';
      const fileTreeSnippet = this._workspaceIndex.fileTree
        ? `\n\nProject structure:\n${this._workspaceIndex.fileTree.split('\n').slice(0, 80).join('\n')}${this._workspaceIndex.fileTree.split('\n').length > 80 ? '\n...(truncated)' : ''}`
        : '';

      // Continue.dev-style system prompt: strict, minimal, action-oriented
      const systemPrompt = `You are an AI coding assistant in CodeNative IDE.${workspaceInfo}

CRITICAL RULES FOR TOOL USAGE:
- When asked to create/write/modify a file, you MUST call tools to do it. Do NOT paste code in chat instead.
- For simple tasks (create file, replace all content), use create_file — it's one step, one tool call, done.
- Only use find_and_replace for surgical edits to LARGE files where you need to change a small part.
- File paths MUST be absolute OS paths (e.g. C:/Coding/project/src/main.ts).
- NEVER output the tool call JSON in your response. The system handles tool execution automatically.
- After tools finish, give a 1-2 sentence summary. Do NOT call more tools unless needed.
- You MUST use tools for ANY file operation. There is NO exception.
- If you need to find files or understand the project structure, call list_files first.
- If the user mentions a file by name but no path, use list_files on the workspace root to find it.${fileTreeSnippet}`;

      messages.push({ role: 'system', content: systemPrompt });

      // ===== CONVERSATION HISTORY =====
      const history = options.history?.slice(-10) || [];

      // Tool-use priming: when there's no history (new chat), inject a
      // fake example exchange so the model sees how tools work here.
      // This prevents the model from just pasting code in chat.
      if (!isNoTool && history.length === 0 && this._workspaceRoot) {
        messages.push({
          role: 'user',
          content: 'Create a file hello.txt with "Hello" in it at C:/example/hello.txt',
        });
        messages.push({
          role: 'assistant',
          content: 'I\'ll create that file for you.',
        });
        messages.push({
          role: 'tool',
          content: '[Done: wrote C:/example/hello.txt (1 lines)]',
        });
        messages.push({
          role: 'assistant',
          content: 'Created `hello.txt` with the content "Hello".',
        });
      }

      for (const msg of history) {
        messages.push({
          role: String(msg.role) === 'ai' ? 'assistant' : 'user',
          content: String(msg.content),
        });
      }

      // ===== RAG: CONTEXT INJECTION =====
      let enrichedInput = input;

      // 1. Auto-detect absolute file paths mentioned in the prompt
      const filePathMatches = input.match(/[A-Za-z]:[\\/][\w\\/.\-]+\.\w+/g);
      if (filePathMatches) {
        for (const rawPath of filePathMatches) {
          const cleanPath = cleanFilePath(rawPath);
          if (fs.existsSync(cleanPath)) {
            try {
              const fileContent = fs.readFileSync(cleanPath, 'utf-8');
              const truncated = fileContent.length > 3000
                ? fileContent.substring(0, 3000) + '\n...(truncated)'
                : fileContent;
              enrichedInput += `\n\n--- Current contents of ${cleanPath} ---\n${truncated}\n--- End of file ---`;
            } catch { }
          }
        }
      }

      // 2. Search for bare filenames in the workspace (e.g. "Solution.java")
      if (this._workspaceRoot) {
        const bareFileMatches = input.match(/\b([A-Za-z0-9_\-]+\.[a-zA-Z]{1,10})\b/g);
        if (bareFileMatches) {
          for (const bareName of bareFileMatches) {
            if (/^(llama|deepseek|mistral|qwen|gemma)/i.test(bareName)) continue;
            if (filePathMatches?.some(p => p.toLowerCase().includes(bareName.toLowerCase()))) continue;

            const foundPath = findFileInWorkspace(this._workspaceRoot, bareName);
            if (foundPath && !enrichedInput.includes(`--- Current contents of ${foundPath}`)) {
              try {
                const fileContent = fs.readFileSync(foundPath, 'utf-8');
                const truncated = fileContent.length > 3000
                  ? fileContent.substring(0, 3000) + '\n...(truncated)'
                  : fileContent;
                enrichedInput += `\n\n--- Current contents of ${foundPath} ---\n${truncated}\n--- End of file ---`;
              } catch { }
            }
          }
        }
      }

      // 3. TF-IDF RAG: find relevant code chunks
      if (this._indexBuilt && this._workspaceIndex.chunks.length > 0 && !isNoTool) {
        const ragResults = retrieveChunks(this._workspaceIndex, input, 5);
        for (const chunk of ragResults) {
          if (!enrichedInput.includes(`--- Current contents of ${chunk.filePath}`)) {
            enrichedInput += `\n\n--- Relevant: ${chunk.relativePath} (lines ${chunk.startLine}-${chunk.endLine}) ---\n${chunk.content}\n--- End ---`;
          }
        }
      }

      messages.push({ role: 'user', content: enrichedInput });

      const controller = new AbortController();
      cancelToken?.onCancellationRequested(() => controller.abort());

      // Model parameters
      const ollamaOptions: Record<string, any> = {};
      if (config) {
        if (config.codeTemperature != null) ollamaOptions.temperature = Number(config.codeTemperature);
        if (config.codeTopP != null) ollamaOptions.top_p = Number(config.codeTopP);
      }

      console.log(`[CodeNative AI] Request => model: ${model}, tools: ${isNoTool ? 'OFF' : 'ON'}, chunks: ${this._workspaceIndex.chunks.length}`);

      // ===== AGENT LOOP =====
      if (isNoTool) {
        await this.doStreamingChat(messages, model, stream, controller, ollamaOptions);
      } else {
        await this.runAgentLoop(messages, model, stream, controller, ollamaOptions);
      }

      stream.end();
    } catch (error: any) {
      if (error.name === 'AbortError') {
        stream.end();
      } else {
        console.error('[CodeNative AI] Stream error:', error.message);
        stream.emitData({ kind: 'content', content: `\n\n**Error:** ${error.message}` });
        stream.end();
      }
    }
  }

  // ======================== AGENT LOOP (Continue.dev-inspired) ========================

  private async runAgentLoop(
    messages: Array<{ role: string; content: string }>,
    model: string,
    stream: ChatReadableStream,
    controller: AbortController,
    ollamaOptions: Record<string, any>,
  ) {
    const MAX_ROUNDS = 8;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          tools: TOOL_DEFINITIONS,
          stream: false,
          options: ollamaOptions,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(`Ollama error ${response.status}: ${errBody.slice(0, 200)}`);
      }

      const json = await response.json() as {
        message?: { role?: string; content?: string; tool_calls?: any[] };
      };

      const msg = json.message;
      if (!msg) break;

      // === PATH A: Structured tool_calls from Ollama (ideal) ===
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        console.log(`[CodeNative AI] Round ${round + 1}: ${msg.tool_calls.length} structured tool call(s)`);

        // Add assistant message to history
        messages.push({ role: 'assistant', content: msg.content || '' });

        for (const tc of msg.tool_calls) {
          const toolName = normalizeToolName(tc.function?.name || '');
          const toolArgs = tc.function?.arguments || {};

          stream.emitData({ kind: 'content', content: `\n> **${this.toolDisplayName(toolName, toolArgs)}**\n` });
          const result = executeToolCall(toolName, toolArgs);
          stream.emitData({ kind: 'content', content: `${result}\n` });

          messages.push({ role: 'tool', content: result });
        }
        continue; // next round
      }

      // === PATH B: Tool calls embedded in text (fallback for weaker models) ===
      const textContent = msg.content || '';
      const parsedCalls = this.tryParseToolCallFromText(textContent);

      if (parsedCalls.length > 0) {
        console.log(`[CodeNative AI] Round ${round + 1}: Parsed ${parsedCalls.length} tool call(s) from text`);

        // Strip ALL tool-related JSON and verbose explanations from text shown to user
        const cleanText = this.stripToolTextFromResponse(textContent);
        if (cleanText) {
          stream.emitData({ kind: 'content', content: cleanText + '\n' });
        }

        // CRITICAL: Store CLEAN version in history, not raw JSON. Otherwise model repeats it.
        messages.push({ role: 'assistant', content: cleanText || 'Using tools to complete your request.' });

        let allResults = '';
        for (const parsed of parsedCalls) {
          const toolName = normalizeToolName(parsed.name);
          stream.emitData({ kind: 'content', content: `\n> **${this.toolDisplayName(toolName, parsed.args)}**\n` });
          const result = executeToolCall(toolName, parsed.args);
          stream.emitData({ kind: 'content', content: `${result}\n` });
          allResults += result + '\n';
        }

        // Follow-up prompt: short, prevents the model from looping
        messages.push({
          role: 'user',
          content: `Tool results:\n${allResults}\nIf the task is complete, give a SHORT summary (1-2 sentences). If more steps are needed, proceed.`,
        });
        continue; // next round
      }

      // === PATH C: No tool calls — just text response. Done. ===
      const cleaned = this.stripToolTextFromResponse(textContent);
      if (cleaned) {
        stream.emitData({ kind: 'content', content: cleaned });
      }
      return; // exit loop — task complete
    }

    // If we exhausted all rounds and the last message was tool output, get a final summary
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === 'tool' || lastMsg.role === 'user') {
      messages.push({ role: 'user', content: 'Summarize what was done in 1-2 sentences. No more tool calls.' });
      await this.doNonStreamingSummary(messages, model, stream, controller, ollamaOptions);
    }
  }

  /** Human-friendly display name for a tool call shown in the chat */
  private toolDisplayName(name: string, args: Record<string, any>): string {
    const file = args.file_path || args.dir_path || args.path || '';
    const shortFile = file ? path.basename(file) : '';
    switch (name) {
      case 'create_file': return `Writing ${shortFile}`;
      case 'read_file': return `Reading ${shortFile}`;
      case 'find_and_replace': return `Editing ${shortFile}`;
      case 'list_files': return `Listing ${shortFile || 'directory'}`;
      default: return name;
    }
  }

  /** Strip tool call JSON, markdown JSON blocks, and verbose tool explanations from model text */
  private stripToolTextFromResponse(text: string): string {
    let cleaned = text;

    // Remove markdown JSON code blocks containing tool calls
    cleaned = cleaned.replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/g, '');

    // Remove bare JSON objects that look like tool calls
    const toolNamePattern = ALL_TOOL_NAMES.join('|');
    const toolJsonRegex = new RegExp(`\\{[\\s\\S]*?"(?:name|function)"\\s*:\\s*"(?:${toolNamePattern})"[\\s\\S]*?\\}`, 'g');
    cleaned = cleaned.replace(toolJsonRegex, '');

    // Remove verbose "Here is the JSON for the function call:" type lines
    cleaned = cleaned.replace(/^.*(?:here is the|json for|function call|tool call).*$/gmi, '');

    // Remove "This will create/overwrite/replace..." filler lines
    cleaned = cleaned.replace(/^(?:This will |Since |To do this).*$/gmi, '');

    // Collapse multiple blank lines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

    return cleaned;
  }

  // ======================== STREAMING CHAT (no tools) ========================

  private async doStreamingChat(
    messages: Array<{ role: string; content: string }>,
    model: string,
    stream: ChatReadableStream,
    controller: AbortController,
    ollamaOptions: Record<string, any> = {},
  ) {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true, options: ollamaOptions }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`Ollama stream failed: ${response.status}`);

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const json = JSON.parse(trimmed);
          if (json.message?.content) {
            stream.emitData({ kind: 'content', content: json.message.content });
          }
        } catch { }
      }
    }
  }

  // ======================== NON-STREAMING SUMMARY (after tools) ========================

  private async doNonStreamingSummary(
    messages: Array<{ role: string; content: string }>,
    model: string,
    stream: ChatReadableStream,
    controller: AbortController,
    ollamaOptions: Record<string, any> = {},
  ) {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false, options: ollamaOptions }),
      signal: controller.signal,
    });

    if (!response.ok) return;

    const json = await response.json() as { message?: { content?: string } };
    let content = json.message?.content || '';
    content = this.stripToolTextFromResponse(content);
    if (content) {
      stream.emitData({ kind: 'content', content: `\n${content}` });
    }
  }

  // ======================== PARSE TOOL CALLS FROM TEXT ========================

  private tryParseToolCallFromText(text: string): Array<{ name: string; args: Record<string, any> }> {
    const results: Array<{ name: string; args: Record<string, any> }> = [];
    const toolNames = ALL_TOOL_NAMES;

    const processParsedObject = (obj: any): boolean => {
      // Direct structure: { name: "...", arguments: { ... } }
      if (obj.name && toolNames.includes(obj.name)) {
        const args = typeof obj.arguments === 'string' ? JSON.parse(obj.arguments) : (obj.arguments || obj.parameters || obj.args || obj);
        results.push({ name: obj.name, args });
        return true;
      }
      // Nested function: { function: { name: "...", arguments: { ... } } }
      if (obj.function?.name && toolNames.includes(obj.function.name)) {
        let args = obj.function.arguments || {};
        if (typeof args === 'string') {
          try { args = JSON.parse(args); } catch { }
        }
        results.push({ name: obj.function.name, args });
        return true;
      }
      // Implicit structure: { "create_new_file": { file_path: "..." } }
      for (const tn of toolNames) {
        if (obj[tn] && typeof obj[tn] === 'object') {
          results.push({ name: tn, args: obj[tn] });
          return true;
        }
      }
      // Bare argument structure — infer tool from argument shape
      if (obj.file_path && obj.content) {
        results.push({ name: 'create_file', args: obj });
        return true;
      }
      if (obj.file_path && (obj.find_text || obj.old_text) && (obj.replace_text || obj.new_text)) {
        results.push({ name: 'find_and_replace', args: obj });
        return true;
      }
      if (obj.file_path && !obj.content && !obj.find_text && !obj.old_text) {
        results.push({ name: 'read_file', args: obj });
        return true;
      }
      if (obj.dir_path) {
        results.push({ name: 'list_files', args: obj });
        return true;
      }
      return false;
    };

    // Strategy 1: Find all markdown JSON blocks
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      try {
        const obj = JSON.parse(match[1]);
        if (processParsedObject(obj)) continue;
      } catch { } // keep trying
    }

    if (results.length > 0) return results;

    // Strategy 2: Find largest { ... } substring and parse
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const possibleJson = text.substring(firstBrace, lastBrace + 1);
      try {
        const obj = JSON.parse(possibleJson);
        processParsedObject(obj);
      } catch { }
    }

    return results;
  }

  // ======================== CODE COMPLETION ========================

  async requestCompletion(input: IAICompletionOption, cancelToken?: CancellationToken) {
    const model = this.modelName;
    try {
      const prompt = `Complete the following code. Only output the completion, no explanation:\n\`\`\`\n${input.prompt}\n\`\`\``;

      const controller = new AbortController();
      cancelToken?.onCancellationRequested(() => controller.abort());

      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) return { sessionId: input.sessionId, codeModelList: [] };

      const result = await response.json() as { message?: { content?: string } };
      if (result.message?.content) {
        return {
          sessionId: input.sessionId,
          codeModelList: [{ content: result.message.content }],
        };
      }
    } catch (err) {
      this.logger.error('Completion error:', err);
    }

    return { sessionId: input.sessionId, codeModelList: [] };
  }
}
