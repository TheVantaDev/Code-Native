import { Autowired, Injectable } from '@opensumi/di';
import { IAIBackService, IAICompletionOption, IAIBackServiceOption } from '@opensumi/ide-core-common';
import { CancellationToken, INodeLogger } from '@opensumi/ide-core-node';
import { BaseAIBackService, ChatReadableStream } from '@opensumi/ide-core-node/lib/ai-native/base-back.service';
import { ILogServiceManager } from '@opensumi/ide-logs';
import * as fs from 'fs';
import * as path from 'path';
import { IModelConfig } from '../common'
import { indexProject, getIndex } from './rag/fileIndexer';
import { indexChunksIntoChroma, resetVectorIndex } from './rag/vectorRetriever';
import { runRAGPipeline, getRAGStatus } from './rag/ragPipeline';
import {
  enhanceQueryWithContext,
  updateContext,
  findSimilarFiles,
  generateRecoverySuggestions,
  getContextInfo,
} from './rag/smartContext';
import {
  captureOriginalContent,
  computeDiff,
  DiffResult,
} from './rag/diffService';
import { startFileWatcher, stopFileWatcher } from './rag/fileWatcher';
import { compressFileForQuery, compressToolReadResult } from './rag/promptCompressor';

// Ollama API
const OLLAMA_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'qwen2.5-coder:7b';
const OLLAMA_HEALTH_TIMEOUT_MS = 5000;
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

// Aider-inspired tool definitions with clear file targeting
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'create_file',
      description: `Create a NEW file or COMPLETELY OVERWRITE an existing file.

⚠️  CONTENT QUALITY RULES (enforced, no exceptions):
- ALWAYS write the COMPLETE, FULLY WORKING implementation — never a skeleton or stub
- NEVER use placeholder comments like "// implement here", "// TODO", "// add code"
- NEVER write partial classes or empty method bodies — every method must have real code
- If user asks for "Prim's algorithm", write the full graph traversal, priority queue, MST logic
- If user asks for "a login page", write real HTML/CSS/JS — not "<form><!-- add fields --></form>"
- The file content must be immediately runnable / compilable

When to use:
- Creating a brand new file that doesn't exist
- Completely replacing ALL content of an existing file (after reading it first)
- User says "rewrite", "replace everything", "start fresh"

FILENAME RULE: If user says "make Prism.java" → file_path must end with Prism.java. Match exactly.`,
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Absolute OS file path. Must match the filename the user specified exactly (case-sensitive on Linux/Mac).',
          },
          content: {
            type: 'string',
            description: 'The COMPLETE file content. Must be fully working code — no placeholders, no stubs, no TODOs left unimplemented.',
          },
        },
        required: ['file_path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: `Read file contents. ALWAYS call this first before editing an existing file.

When to use:
- Before any edit/modify/update/fix operation
- When user mentions a file and you need to see its contents
- Before using find_and_replace`,
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
      description: `Surgically replace ONE specific text block inside a file. For small, precise edits.

HOW TO USE CORRECTLY:
1. First call read_file to get the exact current content
2. Copy the EXACT text you want to replace from the read_file output (including indentation)
3. Set find_text = that exact snippet, replace_text = the new version

⚠️  RULES:
- find_text must be a unique substring — if it appears multiple times, use create_file instead
- For changes to more than ~20 lines, use create_file with the full updated content — it is safer
- replace_text must be COMPLETE code — never leave placeholder comments in the replacement
- If this tool returns an error, immediately retry with create_file

When to use:
- Fixing a single bug (changing one return value, fixing one condition)
- Renaming a variable in one function
- Adding/removing one import statement`,
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute OS file path to the file to edit' },
          find_text: {
            type: 'string',
            description: 'The EXACT text to find (copy it character-for-character from read_file output, including spaces and newlines)',
          },
          replace_text: {
            type: 'string',
            description: 'The new text to put in place of find_text. Must be complete, working code.',
          },
        },
        required: ['file_path', 'find_text', 'replace_text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and directories at a path. Use to discover project structure.',
      parameters: {
        type: 'object',
        properties: {
          dir_path: { type: 'string', description: 'Absolute OS directory path' },
          recursive: { type: 'boolean', description: 'List recursively (max 3 levels). Default false.' },
        },
        required: ['dir_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_code',
      description: `Search for code patterns, function definitions, class names, imports, or any text across the codebase.

Use this when:
- Looking for where a function/class/variable is defined
- Finding all usages of a symbol
- Searching for specific patterns or imports
- Understanding how something is used in the codebase

Returns matching lines with file paths and line numbers.`,
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Text or regex pattern to search for (e.g., "function handleClick", "class User", "import.*lodash")' },
          file_pattern: { type: 'string', description: 'Optional glob pattern to filter files (e.g., "*.ts", "*.java", "src/**/*.py"). Default: all code files.' },
          case_sensitive: { type: 'boolean', description: 'Case-sensitive search. Default: false (case-insensitive).' },
          max_results: { type: 'number', description: 'Maximum number of results to return. Default: 20.' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_project',
      description: `Create multiple files at once for a project scaffold.

Use this when user asks to:
- "create a project", "scaffold a project", "make a new project"
- "create a todo app", "build a calculator app"
- Create multiple related files at once

Each file in the array will be created in sequence.`,
      parameters: {
        type: 'object',
        properties: {
          project_dir: { type: 'string', description: 'Base directory for the project (absolute path)' },
          files: {
            type: 'array',
            description: 'Array of files to create',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Relative path from project_dir (e.g., "src/App.tsx")' },
                content: { type: 'string', description: 'File content' },
              },
              required: ['path', 'content'],
            },
          },
        },
        required: ['project_dir', 'files'],
      },
    },
  },
];

// All recognized tool names for parsing
const ALL_TOOL_NAMES = ['create_file', 'create_new_file', 'read_file', 'find_and_replace', 'edit_existing_file', 'list_files', 'search_code', 'create_project'];

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

// Store workspace root for diff relative paths
let _currentWorkspaceRoot = '';

export function setToolWorkspaceRoot(root: string): void {
  _currentWorkspaceRoot = root;
}

interface ToolExecutionResult {
  message: string;
  diffResult?: DiffResult;
}

/**
 * Fuzzy replace: split findText into individual non-empty lines, find the
 * region in the file that contains the most of them in order, and replace
 * that region with replaceText. Returns null if nothing useful was found.
 */
function attemptFuzzyReplace(fileContent: string, findText: string, replaceText: string): string | null {
  const fileLines = fileContent.split('\n');
  const findLines = findText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (findLines.length === 0) return null;

  // Build a scoring map: for each file line, does it match any findLine?
  const matchScores: number[] = fileLines.map(line => {
    const trimmed = line.trim();
    return findLines.some(fl => trimmed === fl || trimmed.includes(fl) || fl.includes(trimmed)) ? 1 : 0;
  });

  // Find the window of file lines with the highest match density
  const windowSize = Math.max(findLines.length * 2, 10);
  let bestScore = 0;
  let bestStart = -1;

  for (let i = 0; i <= fileLines.length - findLines.length; i++) {
    const end = Math.min(i + windowSize, fileLines.length);
    const score = matchScores.slice(i, end).reduce((a, b) => a + b, 0);
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }

  // Need at least 50% of findLines to match for a confident replacement
  if (bestStart === -1 || bestScore < findLines.length * 0.5) return null;

  const bestEnd = Math.min(bestStart + windowSize, fileLines.length);
  const before = fileLines.slice(0, bestStart).join('\n');
  const after = fileLines.slice(bestEnd).join('\n');
  return [before, replaceText, after].filter(s => s.length > 0).join('\n');
}

function executeToolCall(rawName: string, args: Record<string, any>): ToolExecutionResult {
  const name = normalizeToolName(rawName);

  // Decode HTML entities in ALL string fields (model sometimes generates &quot; etc)
  const decodedArgs: Record<string, any> = {};
  for (const [key, value] of Object.entries(args)) {
    decodedArgs[key] = typeof value === 'string' ? decodeHtmlEntities(value) : value;
  }

  // Dedup guard: skip duplicate tool calls (same tool + same file + same content start)
  if (isDuplicateToolCall(name, decodedArgs)) {
    console.log(`[CodeNative AI] Skipping duplicate tool call: ${name}`);
    return { message: `[Tool skipped: duplicate call to ${name}]` };
  }

  try {
    if (name === 'create_file') {
      const filePath = cleanFilePath(decodedArgs.file_path || decodedArgs.path || '');
      const content = decodedArgs.content || '';
      if (!filePath) return { message: '[Tool error: No file_path provided]' };

      // Capture original content BEFORE writing
      captureOriginalContent(filePath);

      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
      updateContext('file_created', filePath); // Track context

      // Compute diff AFTER writing
      const diffResult = computeDiff(filePath, _currentWorkspaceRoot);

      return {
        message: `[Done: wrote ${filePath} (${content.split('\n').length} lines)]`,
        diffResult,
      };
    }

    if (name === 'read_file') {
      const filePath = cleanFilePath(decodedArgs.file_path || decodedArgs.path || '');
      if (!filePath) return { message: '[Tool error: No file_path provided]' };
      if (!fs.existsSync(filePath)) {
        // Smart error recovery: suggest similar files
        const suggestions = generateRecoverySuggestions(
          'File not found', 'read_file', decodedArgs, process.cwd()
        );
        let errorMsg = `[Tool error: File not found: ${filePath}]`;
        if (suggestions.length > 0) {
          errorMsg += `\n\nSuggestions:\n${suggestions.map(s => `- ${s.action}: ${s.reason}`).join('\n')}`;
        }
        return { message: errorMsg };
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const numbered = lines.map((line, i) => `${i + 1}| ${line}`).join('\n');
      const truncated = numbered.length > 8000
        ? numbered.substring(0, 8000) + '\n...(truncated)'
        : numbered;
      updateContext('file_read', filePath); // Track context
      return { message: `[Contents of ${filePath} — ${lines.length} lines]\n${truncated}` };
    }

    if (name === 'find_and_replace') {
      const filePath = cleanFilePath(decodedArgs.file_path || decodedArgs.path || '');
      const findText = decodedArgs.find_text || decodedArgs.old_text || decodedArgs.search || '';
      const replaceText = decodedArgs.replace_text || decodedArgs.new_text || decodedArgs.replacement || '';
      if (!filePath) return { message: '[Tool error: No file_path provided]' };
      if (!fs.existsSync(filePath)) return { message: `[Tool error: File not found: ${filePath}]` };
      if (!findText) return { message: '[Tool error: No find_text provided]' };

      const currentContent = fs.readFileSync(filePath, 'utf-8');

      // Ambiguity check (Continue.dev pattern): if find_text matches multiple locations, reject
      const matchCount = currentContent.split(findText).length - 1;
      if (matchCount > 1) {
        return { message: `[Tool error: find_text matches ${matchCount} locations in ${filePath}. Provide a larger/more unique text snippet, or use create_file with the complete updated content.]` };
      }

      // Capture original content BEFORE editing
      captureOriginalContent(filePath);

      // Strategy 1: Exact substring match
      if (matchCount === 1) {
        const newContent = currentContent.replace(findText, replaceText);
        fs.writeFileSync(filePath, newContent, 'utf-8');
        updateContext('file_edited', filePath); // Track context

        // Compute diff AFTER editing
        const diffResult = computeDiff(filePath, _currentWorkspaceRoot);

        return {
          message: `[Done: edited ${filePath}]`,
          diffResult,
        };
      }

      // Strategy 2: Trimmed match
      const trimmedFind = findText.trim();
      if (trimmedFind && currentContent.includes(trimmedFind)) {
        const newContent = currentContent.replace(trimmedFind, replaceText.trim());
        fs.writeFileSync(filePath, newContent, 'utf-8');
        updateContext('file_edited', filePath); // Track context

        // Compute diff AFTER editing
        const diffResult = computeDiff(filePath, _currentWorkspaceRoot);

        return {
          message: `[Done: edited ${filePath} (trimmed match)]`,
          diffResult,
        };
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
            updateContext('file_edited', filePath); // Track context

            // Compute diff AFTER editing
            const diffResult = computeDiff(filePath, _currentWorkspaceRoot);

            return {
              message: `[Done: edited ${filePath} (normalized match)]`,
              diffResult,
            };
          }
        }
      }

      // Strategy 3 failed — fall through to Strategy 4

      // ===== STRATEGY 4: Auto-fallback — rewrite the full file with best-effort substitution =====
      // This ensures edits NEVER silently fail. Find the closest matching region and replace it.
      const fallbackContent = attemptFuzzyReplace(currentContent, findText, replaceText);
      if (fallbackContent !== null) {
        captureOriginalContent(filePath);
        fs.writeFileSync(filePath, fallbackContent, 'utf-8');
        updateContext('file_edited', filePath);
        const diffResult = computeDiff(filePath, _currentWorkspaceRoot);
        return {
          message: `[Done: edited ${filePath} (fuzzy fallback)]`,
          diffResult,
        };
      }

      // Last resort: tell the model to use create_file
      return { message: `[Tool error: Text not found in ${filePath}. Please use create_file with the complete updated file content to apply your changes.]` };
    }

    if (name === 'list_files') {
      const dirPath = cleanFilePath(decodedArgs.dir_path || decodedArgs.path || '');
      const recursive = decodedArgs.recursive === true;
      if (!dirPath) return { message: '[Tool error: No dir_path provided]' };
      if (!fs.existsSync(dirPath)) return { message: `[Tool error: Directory not found: ${dirPath}]` };

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
      return { message: `[Contents of ${dirPath}]\n${entries.join('\n')}${suffix}` };
    }

    if (name === 'search_code') {
      const pattern = decodedArgs.pattern || '';
      const filePattern = decodedArgs.file_pattern || '';
      const caseSensitive = decodedArgs.case_sensitive === true;
      const maxResults = Math.min(decodedArgs.max_results || 20, 50);

      if (!pattern) return { message: '[Tool error: No search pattern provided]' };

      const searchRoot = _currentWorkspaceRoot || process.cwd();
      const results: Array<{ file: string; line: number; text: string }> = [];

      const IGNORE_DIRS = new Set([
        'node_modules', '.git', 'out', 'build', 'dist', 'target',
        '.cache', '.next', '__pycache__', '.vscode', '.idea', 'coverage',
      ]);

      const CODE_EXTENSIONS = new Set([
        '.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
        '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala', '.cs', '.vue',
        '.html', '.css', '.scss', '.sass', '.less', '.json', '.xml', '.yaml', '.yml',
        '.md', '.txt', '.sql', '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
      ]);

      // Build regex for matching
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
      } catch {
        // If invalid regex, treat as literal string
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
      }

      // Build file pattern matcher
      const matchesFilePattern = (filePath: string): boolean => {
        if (!filePattern) return true;
        const fileName = path.basename(filePath);
        const ext = path.extname(filePath).toLowerCase();

        // Simple glob patterns: *.ts, *.java, src/**/*.py
        if (filePattern.startsWith('*.')) {
          return ext === filePattern.slice(1) || ext === '.' + filePattern.slice(2);
        }
        if (filePattern.includes('**')) {
          const parts = filePattern.split('**');
          const prefix = parts[0].replace(/\//g, path.sep);
          const suffix = parts[1]?.replace(/\//g, path.sep) || '';
          const relativePath = path.relative(searchRoot, filePath);
          return relativePath.startsWith(prefix.replace(/\/$/, '')) &&
            (suffix ? relativePath.endsWith(suffix.replace(/^\/?\*/, '')) : true);
        }
        return fileName.includes(filePattern) || filePath.includes(filePattern);
      };

      // Recursive search function
      function searchDir(dir: string, depth: number) {
        if (results.length >= maxResults || depth > 8) return;
        try {
          const items = fs.readdirSync(dir, { withFileTypes: true });
          for (const item of items) {
            if (results.length >= maxResults) break;
            const fullPath = path.join(dir, item.name);

            if (item.isDirectory()) {
              if (IGNORE_DIRS.has(item.name)) continue;
              searchDir(fullPath, depth + 1);
            } else {
              const ext = path.extname(item.name).toLowerCase();
              if (!CODE_EXTENSIONS.has(ext)) continue;
              if (!matchesFilePattern(fullPath)) continue;

              try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const lines = content.split('\n');
                for (let i = 0; i < lines.length && results.length < maxResults; i++) {
                  if (regex.test(lines[i])) {
                    results.push({
                      file: path.relative(searchRoot, fullPath),
                      line: i + 1,
                      text: lines[i].trim().slice(0, 120),
                    });
                  }
                  // Reset regex lastIndex for global flag
                  regex.lastIndex = 0;
                }
              } catch { /* skip unreadable files */ }
            }
          }
        } catch { /* skip unreadable dirs */ }
      }

      searchDir(searchRoot, 0);

      if (results.length === 0) {
        return { message: `[Search: No matches found for "${pattern}"${filePattern ? ` in ${filePattern}` : ''}]` };
      }

      const formatted = results.map(r => `${r.file}:${r.line}: ${r.text}`).join('\n');
      const truncated = results.length >= maxResults ? `\n...(showing first ${maxResults} results)` : '';
      return { message: `[Search results for "${pattern}" — ${results.length} matches]\n${formatted}${truncated}` };
    }

    if (name === 'create_project') {
      const projectDir = cleanFilePath(decodedArgs.project_dir || '');
      const files = decodedArgs.files || [];
      if (!projectDir) return { message: '[Tool error: No project_dir provided]' };
      if (!Array.isArray(files) || files.length === 0) return { message: '[Tool error: No files provided]' };

      // Create project directory if it doesn't exist
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
      }

      const results: string[] = [];
      for (const file of files) {
        try {
          const relativePath = file.path || '';
          const content = file.content || '';
          if (!relativePath) continue;

          const fullPath = path.join(projectDir, relativePath);
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(fullPath, content, 'utf-8');
          results.push(`  ✓ ${relativePath} (${content.split('\n').length} lines)`);
        } catch (err: any) {
          results.push(`  ✗ ${file.path}: ${err.message}`);
        }
      }

      return { message: `[Project created at ${projectDir}]\nFiles created:\n${results.join('\n')}` };
    }

    return { message: `[Tool error: Unknown tool "${name}"]` };
  } catch (err: any) {
    return { message: `[Tool error: ${err.message || String(err)}]` };
  }
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

  // ===== RAG: BM25 + Vector Index =====
  // Index is stored in the fileIndexer module-level singleton (getIndex())
  private _workspaceRoot: string = '';
  private _indexBuilt = false;

  // ===== Conversation Memory (Enhancement 1: Cursor-style session summarization) =====
  // After MEMORY_THRESHOLD turns, old history is compressed into a summary block.
  // This keeps the active context window lean while preserving long-session continuity.
  private _sessionMemory: string = '';
  private _memoryMessageCount: number = 0;
  private static readonly MEMORY_THRESHOLD = 8; // compress after this many history messages
  private static readonly MEMORY_COMPRESS_KEEP = 4; // keep last N messages verbatim after compress

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
    // Reset session memory when workspace changes
    this._sessionMemory = '';
    this._memoryMessageCount = 0;
    setToolWorkspaceRoot(cleanDir); // Set workspace root for diff service
    console.log(`[CodeNative AI] Workspace root set to: ${cleanDir}`);

    // Build BM25 index asynchronously
    setTimeout(async () => {
      console.log(`[CodeNative AI] Building workspace index (BM25)...`);
      resetVectorIndex();
      const project = await indexProject(cleanDir);
      this._indexBuilt = true;
      console.log(`[CodeNative AI] Workspace index built: ${project.totalFiles} files, ${project.totalChunks} chunks`);
      const firstFiles = project.fileTree.split('\n').slice(0, 10).join('\n');
      console.log(`[CodeNative AI] File tree preview:\n${firstFiles}`);

      // Start file watcher for incremental re-indexing
      startFileWatcher(cleanDir, () => {
        console.log(`[CodeNative AI] File changed — index updated`);
      });

      // Build vector index in ChromaDB (optional, falls back to BM25-only if unavailable)
      indexChunksIntoChroma().catch(err =>
        console.warn('[CodeNative AI] Vector indexing failed (non-fatal):', err?.message ?? String(err)),
      );
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
      const response = await fetch(OLLAMA_URL, { method: 'GET', signal: AbortSignal.timeout(OLLAMA_HEALTH_TIMEOUT_MS) });
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

  // ======================== MEMORY COMPRESSION ========================

  /**
   * Cursor-style conversation memory summarization.
   * When history grows beyond MEMORY_THRESHOLD messages, we call Ollama to
   * compress the oldest half into a short "session memory" paragraph.
   * The summary is prepended to every subsequent prompt so the model never
   * loses track of long-running context.
   */
  private async compressHistory(
    history: Array<{ role: string; content: string }>,
    model: string,
  ): Promise<{ compressed: Array<{ role: string; content: string }>; memory: string }> {
    const threshold = AIBackService.MEMORY_THRESHOLD;
    const keep = AIBackService.MEMORY_COMPRESS_KEEP;

    if (history.length < threshold) {
      return { compressed: history, memory: this._sessionMemory };
    }

    // Split: compress the old part, keep the recent part verbatim
    const toCompress = history.slice(0, history.length - keep);
    const toKeep = history.slice(history.length - keep);

    // Build a concise summary prompt
    const summaryMessages = [
      {
        role: 'system',
        content: 'You are a memory assistant. Summarize the following conversation into 3-5 bullet points. Focus on: what files were created/edited, what the user\'s goal is, and any important decisions made. Be extremely concise. Output ONLY the bullet points, no intro.',
      },
      {
        role: 'user',
        content: toCompress
          .map(m => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content.slice(0, 300)}`)
          .join('\n'),
      },
    ];

    try {
      const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: summaryMessages, stream: false, options: { num_ctx: 2048, temperature: 0 } }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const json = await res.json() as { message?: { content?: string } };
        const summary = (json.message?.content || '').trim();
        if (summary) {
          const existingMemory = this._sessionMemory ? this._sessionMemory + '\n' : '';
          this._sessionMemory = existingMemory + summary;
          this._memoryMessageCount = toKeep.length;
          console.log(`[CodeNative AI] Memory compressed: ${toCompress.length} messages → summary (${summary.length} chars)`);
          return { compressed: toKeep, memory: this._sessionMemory };
        }
      }
    } catch (err) {
      console.warn('[CodeNative AI] Memory compression failed (non-fatal):', err);
    }

    // Fallback: just truncate without summarizing
    return { compressed: toKeep, memory: this._sessionMemory };
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

    // ===== EXTRACT IDE CONTEXT from browser-side injection =====
    const activeFile: { path: string; line?: number; column?: number; language?: string } | undefined
      = (options as any).activeFile;
    const openTabs: string[] | undefined = (options as any).openTabs;
    const clientWorkspaceRoot: string | undefined = (options as any).workspaceRoot;

    // Use client-provided workspace root as fallback if node-side isn't set
    const effectiveWorkspaceRoot = this._workspaceRoot || clientWorkspaceRoot || '';

    // Clear dedup history for each new request
    clearToolCallHistory();

    try {
      const controller = new AbortController();
      cancelToken?.onCancellationRequested(() => controller.abort());

      const messages: Array<{ role: string; content: string }> = [];

      // ===== PARSE @MENTIONS: @filename.ts or @path/to/file =====
      let atMentionContext = '';
      const atMentionPattern = /@([\/\\\w\-\.]+\.\w+)/g;
      let atMatch: RegExpExecArray | null;
      const mentionedPaths = new Set<string>();
      while ((atMatch = atMentionPattern.exec(input)) !== null) {
        const mentioned = atMatch[1];
        // Try absolute path first, then search workspace
        let resolvedPath: string | null = null;
        if (path.isAbsolute(mentioned) && fs.existsSync(mentioned)) {
          resolvedPath = mentioned;
        } else if (effectiveWorkspaceRoot) {
          const joined = path.join(effectiveWorkspaceRoot, mentioned);
          if (fs.existsSync(joined)) {
            resolvedPath = joined;
          } else {
            // Search workspace for the filename
            resolvedPath = findFileInWorkspace(effectiveWorkspaceRoot, path.basename(mentioned));
          }
        }
        if (resolvedPath && !mentionedPaths.has(resolvedPath)) {
          mentionedPaths.add(resolvedPath);
          try {
            const rawContent = fs.readFileSync(resolvedPath, 'utf-8');
            // Context-Aware Compression: score each section vs. the query
            const compressed = compressFileForQuery(rawContent, resolvedPath, input, 120);
            atMentionContext += `\n<at_mention path="${resolvedPath}" lines="${compressed.compressedLines}/${compressed.originalLines}">\n${compressed.content}\n</at_mention>`;
          } catch { }
        }
      }

      // ===== SMART CONTEXT: Enhance query with context understanding =====
      const smartContext = effectiveWorkspaceRoot
        ? enhanceQueryWithContext(input, effectiveWorkspaceRoot)
        : { enhancedQuery: input, systemNote: '', resolvedFile: null };

      if (smartContext.systemNote) {
        console.log(`[CodeNative AI] SmartContext: ${smartContext.systemNote}`);
      }

      // ===== RAG PIPELINE: Query Classification + Context Retrieval =====
      const ragStatus = getRAGStatus();
      const ragResult = this._indexBuilt
        ? await runRAGPipeline(input, {
          topK: 8,
          maxTokens: 4000,
          includeFileTree: false,
          conversationHistory: (options.history || []).map(msg => ({
            role: String(msg.role) === 'ai' ? 'assistant' : 'user',
            content: String(msg.content),
          })),
        })
        : null;

      if (ragResult) {
        console.log(`[CodeNative AI] RAG: intent=${ragResult.classification.intent}, confidence=${ragResult.classification.confidence.toFixed(2)}, retrieval=${ragResult.retrievalMethod}, chunks=${ragResult.rawResults.length}`);
      }

      // ===== SYSTEM PROMPT =====
      const workspaceInfo = effectiveWorkspaceRoot ? `\nWorkspace: ${effectiveWorkspaceRoot}` : '';
      const currentIndex = getIndex();
      const queryIntent = ragResult?.classification.intent || 'general';

      // ── Active editor section ──
      let activeEditorSection = '';
      if (activeFile?.path) {
        const lineInfo = activeFile.line ? ` (line ${activeFile.line})` : '';
        const langInfo = activeFile.language ? `, language: ${activeFile.language}` : '';
        activeEditorSection = `\n\n## ACTIVE EDITOR\nFile: ${activeFile.path}${lineInfo}${langInfo}\n`;
        activeEditorSection += `When user says "this file", "the current file", "it", or refers to line numbers without specifying a file → use: ${activeFile.path}`;

        // Context-Aware Prompt Compression (Enhancement 3):
        // Instead of naively sending the first 80 lines, we score every section
        // of the active file against the user's query and send only relevant
        // sections + collapsed summaries of the rest. 60-80% token reduction.
        if ((queryIntent === 'code_action' || queryIntent === 'project' || queryIntent === 'hybrid') && !mentionedPaths.has(activeFile.path)) {
          try {
            if (fs.existsSync(activeFile.path)) {
              const rawContent = fs.readFileSync(activeFile.path, 'utf-8');
              const compressed = compressFileForQuery(rawContent, activeFile.path, input, 150);
              const statsNote  = compressed.wasAlreadySmall
                ? ''
                : ` [compressed ${compressed.originalLines}→${compressed.compressedLines} lines, ${Math.round(compressed.compressionRatio * 100)}% reduction]`;
              activeEditorSection += `\n\n<active_file${statsNote}>\n${compressed.content}\n</active_file>`;
            }
          } catch { }
        }
      }

      // ── Open tabs section ──
      let openTabsSection = '';
      if (openTabs && openTabs.length > 0) {
        openTabsSection = `\n\n## OPEN EDITOR TABS\n${openTabs.map(t => `- ${t}`).join('\n')}`;
        openTabsSection += `\nThese files are currently open. Prioritize them when the user says "the open files" or similar.`;
      }

      // ── Tool instructions ──
      const ragSystemPrompt = ragResult?.systemPrompt || '';
      const toolInstructions = (isNoTool || queryIntent === 'general') ? '' : `

## FILE OPERATIONS

You have access to these tools. Use them via the structured tool_call API — NEVER output raw JSON.

### AVAILABLE TOOLS:
| Tool | When to use |
|------|-------------|
| create_file | Create a new file OR completely rewrite an existing file's content |
| read_file | Read a file before editing — ALWAYS do this first before any edit |
| find_and_replace | One surgical change only — copy exact text from read_file, replace precisely |
| list_files | Discover what files/directories exist |
| search_code | Find where a function/class/symbol is defined or used |
| create_project | Scaffold multiple files at once for a whole new project |

### WORKFLOW RULES:
1. **Read before editing** — ALWAYS call read_file before find_and_replace or create_file on existing files.
2. **Exact filenames** — If user says "edit Prism.java", the file_path must end with Prism.java exactly.
3. **Absolute paths** — Always use full absolute paths. Workspace root: \`${effectiveWorkspaceRoot || '(not set)'}\`
4. **Large rewrites** — If changing more than ~20 lines, use create_file with the full updated content.
5. **No raw JSON** — Do NOT output {"name":..., "arguments":...} blocks. Use the tool_calls API only.
6. **No code blocks** — Do NOT output \`\`\`code\`\`\` blocks. The tool writes the file for you.

### ⚡ CODE QUALITY (CRITICAL — this is the most important rule):
- When writing ANY code, write the COMPLETE, FULLY WORKING implementation.
- NEVER write placeholder comments like: "// implement here", "// TODO", "// add logic", "// insert algorithm".
- NEVER write empty method bodies — every function must have real, working code inside.
- NEVER write a skeleton and say "fill this in" — the user wants working code immediately.
- If the user asks for Prim's algorithm → write the FULL graph + priority queue + MST traversal.
- If the user asks for a sorting algorithm → write the complete sort with real comparisons.
- If the user asks for a login form → write the complete HTML + CSS + validation JS.
- Code quality: clean variable names, proper indentation, comments on complex logic.

### RESPONSE FORMAT:
- Call the tool IMMEDIATELY — do NOT write a planning sentence before calling it.
- After the tool runs, write a single short confirmation sentence.
- If user asks a question → answer directly, no tools needed.
- WRONG: "Creating BellmanFord.java..." then stop. RIGHT: Call create_file right away.`;

      // ── Repo Map (Enhancement 2: Aider-style symbol index) ──
      // For code_action and project intents, inject a compact repo map showing all
      // exported symbols per file. This gives the model the full architecture picture
      // without reading every file, similar to Aider's "repo map" feature.
      let repoMapSection = '';
      if ((queryIntent === 'code_action' || queryIntent === 'project' || queryIntent === 'hybrid') && currentIndex?.symbolsMap) {
        const mapLines = currentIndex.symbolsMap.split('\n');
        // Prioritize files mentioned in the query or active file's directory
        const queryLower = input.toLowerCase();
        const activeDir = activeFile?.path ? path.dirname(activeFile.path).toLowerCase() : '';

        const prioritized: string[] = [];
        const rest: string[] = [];
        for (const line of mapLines) {
          const lineLower = line.toLowerCase();
          const isRelevant = queryLower.split(/\s+/).some(word => word.length > 3 && lineLower.includes(word))
            || (activeDir && lineLower.includes(path.basename(activeDir).toLowerCase()));
          if (isRelevant) prioritized.push(line);
          else rest.push(line);
        }

        // Take up to 30 prioritized lines + 20 rest for a ~50 line map max
        const selectedLines = [...prioritized.slice(0, 30), ...rest.slice(0, 20)];
        if (selectedLines.length > 0) {
          repoMapSection = `\n\n## REPO MAP (exported symbols)\n\`\`\`\n${selectedLines.join('\n')}\n\`\`\``;
        }
      }

      // ===== CONVERSATION HISTORY with Memory Compression =====
      // IMPORTANT: Run compressHistory FIRST so sessionMemory is available
      // when we build the system prompt below.
      const rawHistory: Array<{ role: string; content: string }> = (options.history?.slice(-32) || [])
        .map(msg => ({
          role: String(msg.role) === 'ai' ? 'assistant' : 'user',
          content: String(msg.content || '').trim(),
        }))
        .filter(m => m.content.length > 0);

      const { compressed: history, memory: sessionMemory } = await this.compressHistory(rawHistory, model);

      // ── Restore variables that system prompt assembly needs ──
      const smartContextHint = smartContext.systemNote
        ? `\n\n## CONTEXT FROM CONVERSATION:\n${smartContext.systemNote}`
        : '';

      const fileTreeSnippet = queryIntent !== 'general' && currentIndex?.fileTree
        ? `\n\nProject structure:\n${currentIndex.fileTree.split('\n').slice(0, 40).join('\n')}${currentIndex.fileTree.split('\n').length > 40 ? '\n...(truncated)' : ''}`
        : '';

      // ── Session Memory section ──
      const sessionMemorySection = sessionMemory
        ? `\n\n## SESSION MEMORY (what we've done so far)\n${sessionMemory}`
        : '';

      // ── Build the layered system prompt ──
      const baseIdentity = ragSystemPrompt
        ? `${ragSystemPrompt}`
        : [
            `You are CodeNative AI, an expert software engineering assistant embedded inside CodeNative IDE.`,
            `Your job is to understand exactly what the user is asking and respond clearly, accurately, and concisely.`,
            `When you answer questions, be direct and precise. When you operate on files, use tools — never describe code without writing it.`,
          ].join(' ');

      const systemPrompt = [
        baseIdentity,
        workspaceInfo,
        sessionMemorySection,
        activeEditorSection,
        openTabsSection,
        repoMapSection,
        toolInstructions,
        smartContextHint,
        fileTreeSnippet,
      ].filter(Boolean).join('');

      messages.push({ role: 'system', content: systemPrompt });

      for (const msg of history) {
        messages.push({ role: msg.role, content: msg.content });
      }

      // ===== BUILD USER MESSAGE =====
      let enrichedInput = input;
      let explicitFileContext = atMentionContext; // Start with @mention files

      // 1. Auto-detect absolute file paths mentioned in the prompt
      const filePathMatches = input.match(/[A-Za-z]:[\\/][\w\\/.\-]+\.\w+/g);
      if (filePathMatches) {
        for (const rawPath of filePathMatches) {
          const cleanPath = cleanFilePath(rawPath);
          if (fs.existsSync(cleanPath) && !mentionedPaths.has(cleanPath)) {
            try {
              const rawContent   = fs.readFileSync(cleanPath, 'utf-8');
              // Context-Aware Compression: only relevant sections sent
              const compressed   = compressFileForQuery(rawContent, cleanPath, input, 120);
              explicitFileContext += `\n<explicit_file path="${cleanPath}" lines="${compressed.compressedLines}/${compressed.originalLines}">\n${compressed.content}\n</explicit_file>`;
              mentionedPaths.add(cleanPath);
            } catch { }
          }
        }
      }

      // 2. Search for bare filenames in the workspace (e.g. "Solution.java")
      if (effectiveWorkspaceRoot) {
        const bareFileMatches = input.match(/\b([A-Za-z0-9_\-]+\.[a-zA-Z]{1,10})\b/g);
        if (bareFileMatches) {
          for (const bareName of bareFileMatches) {
            if (/^(llama|deepseek|mistral|qwen|gemma)/i.test(bareName)) continue;
            if (filePathMatches?.some(p => p.toLowerCase().includes(bareName.toLowerCase()))) continue;

            const foundPath = findFileInWorkspace(effectiveWorkspaceRoot, bareName);
            if (foundPath && !explicitFileContext.includes(foundPath) && !mentionedPaths.has(foundPath)) {
              try {
                const fileContent = fs.readFileSync(foundPath, 'utf-8');
                const truncated = fileContent.length > 3000
                  ? fileContent.substring(0, 3000) + '\n...(truncated)'
                  : fileContent;
                explicitFileContext += `\n<explicit_file path="${foundPath}">\n${truncated}\n</explicit_file>`;
              } catch { }
            }
          }
        }
      }

      // 3. Inject open tabs content for code_action/project intents (first 40 lines each, max 3 tabs)
      if (openTabs && openTabs.length > 0 && (queryIntent === 'code_action' || queryIntent === 'project')) {
        let tabsInjected = 0;
        for (const tabPath of openTabs.slice(0, 5)) {
          if (tabsInjected >= 3) break;
          if (mentionedPaths.has(tabPath)) continue;
          if (activeFile?.path && tabPath === activeFile.path) continue; // Already in activeEditorSection
          try {
            if (fs.existsSync(tabPath)) {
              const content = fs.readFileSync(tabPath, 'utf-8');
              const lines = content.split('\n').slice(0, 40).join('\n');
              explicitFileContext += `\n<open_tab path="${tabPath}">\n${lines}\n${content.split('\n').length > 40 ? '...(truncated)' : ''}\n</open_tab>`;
              tabsInjected++;
            }
          } catch { }
        }
      }

      // 4. Combine: explicit files + RAG context (only if RAG decided to retrieve)
      const ragContext = ragResult?.context.text || '';

      if (explicitFileContext || ragContext) {
        if (ragResult?.classification.shouldRetrieve && ragContext) {
          enrichedInput = `${ragContext}\n\n${explicitFileContext}\n\n<user_query>\n${input}\n</user_query>`;
        } else if (explicitFileContext) {
          enrichedInput = `${explicitFileContext}\n\n<user_query>\n${input}\n</user_query>`;
        }
      }

      messages.push({ role: 'user', content: enrichedInput });

      // Model parameters
      const ollamaOptions: Record<string, any> = {};
      if (config) {
        if (config.codeTemperature != null) ollamaOptions.temperature = Number(config.codeTemperature);
        if (config.codeTopP != null) ollamaOptions.top_p = Number(config.codeTopP);
      }

      // ===== ROUTING: Agent Loop vs Simple Chat =====
      // General/hybrid queries don't need tools - use simple streaming chat
      // Only code_action and project queries that might need file operations go to agent loop
      const useTools = !isNoTool && (queryIntent === 'code_action' || queryIntent === 'project');

      console.log(`[CodeNative AI] Request => model: ${model}, intent: ${queryIntent}, useTools: ${useTools}, ragChunks: ${ragResult?.rawResults.length ?? 0}`);

      if (useTools) {
        await this.runAgentLoop(messages, model, stream, controller, ollamaOptions, input);
      } else {
        await this.doStreamingChat(messages, model, stream, controller, ollamaOptions);
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
    userQuery: string = '',
  ) {
    const MAX_ROUNDS = 8;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      console.log(`[CodeNative AI] Agent round ${round + 1}/${MAX_ROUNDS}, history depth: ${messages.length}`);
      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          tools: TOOL_DEFINITIONS,
          stream: false,
          options: {
            ...ollamaOptions,
            // Guarantee a consistent context window so the model never loses
            // the system prompt or early conversation turns.
            num_ctx: 8192,
          },
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

        // Only add assistant message if it has actual content (Ollama often sends empty string here)
        const assistantContent = (msg.content || '').trim();
        if (assistantContent) {
          stream.emitData({ kind: 'content', content: assistantContent + '\n' });
          messages.push({ role: 'assistant', content: assistantContent });
        } else {
          messages.push({ role: 'assistant', content: '' });
        }

        for (const tc of msg.tool_calls) {
          const toolName = normalizeToolName(tc.function?.name || '');
          // CRITICAL: Ollama sometimes returns arguments as JSON string, not object
          let toolArgs = tc.function?.arguments || {};
          if (typeof toolArgs === 'string') {
            try { toolArgs = JSON.parse(toolArgs); } catch { toolArgs = {}; }
          }

          stream.emitData({ kind: 'content', content: `\n> **${this.toolDisplayName(toolName, toolArgs)}**\n` });
          const toolResult = executeToolCall(toolName, toolArgs);
          stream.emitData({ kind: 'content', content: `${toolResult.message}\n` });

          // Emit rich diff block when file was modified
          if (toolResult.diffResult?.diff) {
            const diffMd = this.formatRichDiff(toolResult.diffResult);
            if (diffMd) {
              stream.emitData({ kind: 'content', content: `\n${diffMd}\n` });
            }
          }

          messages.push({ role: 'tool', content: compressToolReadResult(toolResult.message, userQuery) });
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
          const toolResult = executeToolCall(toolName, parsed.args);
          stream.emitData({ kind: 'content', content: `${toolResult.message}\n` });

          // Emit rich diff block when file was modified
          if (toolResult.diffResult?.diff) {
            const diffMd = this.formatRichDiff(toolResult.diffResult);
            if (diffMd) {
              stream.emitData({ kind: 'content', content: `\n${diffMd}\n` });
            }
          }

          allResults += toolResult.message + '\n';
          // Compress read_file results before storing in history
          // (full content is already streamed to user; history only needs a lean summary)
          messages.push({ role: 'tool', content: compressToolReadResult(toolResult.message, userQuery) });
        }

        // Follow-up prompt: short, prevents the model from looping
        messages.push({
          role: 'user',
          content: `Tool results:\n${allResults}\nIf the task is complete, give a SHORT summary (1-2 sentences). If more steps are needed, proceed.`,
        });
        continue; // next round
      }

      // === PATH B.5: Retry if model output raw JSON instead of structured tool_calls ===
      const looksLikeFailedToolCall =
        /```(?:json)?\s*\{[\s\S]*$/i.test(textContent)
        || /"name"\s*:\s*"(?:create_file|read_file|find_and_replace|list_files|search_code|create_project)"/i.test(textContent)
        || /"function"\s*:\s*\{\s*"name"/i.test(textContent);

      if (looksLikeFailedToolCall && round < MAX_ROUNDS - 2) {
        console.log(`[CodeNative AI] Round ${round + 1}: Model emitted raw JSON — nudging to structured tool_calls`);
        messages.push({ role: 'assistant', content: textContent });
        messages.push({
          role: 'user',
          content: `Please use the structured tool_call API to call the tool — do not output JSON text. Call the function directly.`,
        });
        continue;
      }

      // === PATH B.6: Model announced intent but never called the tool ===
      // Detects: "Creating X...", "I'll create...", "Writing X...", "Let me create..."
      // These are plan-only responses — the model said what it would do but didn't do it.
      const looksLikeUnfulfilledIntent =
        round < MAX_ROUNDS - 2 &&
        /(?:creating|writing|making|generating|building|implementing|let me create|i(?:'ll| will) (?:create|write|make|generate|implement)|now (?:creating|writing|making))/i.test(textContent) &&
        /(?:file|java|py|ts|js|html|css|class|algorithm|function|method)/i.test(textContent);

      if (looksLikeUnfulfilledIntent) {
        console.log(`[CodeNative AI] Round ${round + 1}: Model stated intent without calling tool — nudging to execute`);
        messages.push({ role: 'assistant', content: textContent });
        messages.push({
          role: 'user',
          content: `You described what you would do but did not call the tool. Please call create_file (or the appropriate tool) RIGHT NOW with the complete implementation. Do not describe it — execute it.`,
        });
        continue;
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
      case 'search_code': return `Searching for "${(args.pattern || '').slice(0, 30)}"`;
      default: return name;
    }
  }

  /**
   * Format a DiffResult as a rich markdown block for display in chat.
   * Uses unified diff syntax with a clear header showing stats.
   */
  private formatRichDiff(diffResult: DiffResult): string {
    if (!diffResult.diff || !diffResult.unifiedDiff) return '';

    const { relativePath, summary } = diffResult.diff;
    const statsLine = [
      summary.additions > 0 ? `+${summary.additions}` : '',
      summary.deletions > 0 ? `-${summary.deletions}` : '',
    ].filter(Boolean).join('  ');

    const lines: string[] = [];
    lines.push(`**📄 ${relativePath}** · ${statsLine}`);
    lines.push('');
    lines.push('```diff');
    lines.push(diffResult.unifiedDiff);
    lines.push('```');

    return lines.join('\n');
  }

  /** Strip tool call JSON, markdown JSON blocks, and verbose tool explanations from model text */
  private stripToolTextFromResponse(text: string): string {
    let cleaned = text;

    // ===== CRITICAL: Strip "thoughts/response" JSON format (Qwen/Llama quirk) =====
    // Models like Qwen sometimes output: {"thoughts": "...", "response": "...", "next_steps": []}
    // This is NOT a tool call - it is the model generating raw JSON as its response.
    // We extract the "response" field and discard the rest.
    cleaned = cleaned.replace(
      /\{\s*"thoughts"\s*:[\s\S]*?"response"\s*:\s*"((?:[^"\\]|\\.)*?)"[\s\S]*?\}/g,
      (_match, response) => response.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"'),
    );

    // Also strip any leftover thinking output wrapped in {"response":"..."} without "thoughts"
    cleaned = cleaned.replace(
      /\{\s*"response"\s*:\s*"((?:[^"\\]|\\.)*?)"\s*\}/g,
      (_match, response) => response.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"'),
    );

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
      // Handle arrays - process each item
      if (Array.isArray(obj)) {
        let found = false;
        for (const item of obj) {
          if (processParsedObject(item)) found = true;
        }
        return found;
      }
      // Handle tool_calls wrapper: { tool_calls: [...] }
      if (obj.tool_calls && Array.isArray(obj.tool_calls)) {
        let found = false;
        for (const tc of obj.tool_calls) {
          if (processParsedObject(tc)) found = true;
        }
        return found;
      }
      // Direct structure: { name: "...", arguments: { ... } }
      if (obj.name && toolNames.includes(obj.name)) {
        const args = typeof obj.arguments === 'string' ? JSON.parse(obj.arguments) : (obj.arguments || obj.parameters || obj.args || obj);
        results.push({ name: obj.name, args });
        return true;
      }
      // Nested function: { function: { name: "...", arguments: { ... } } }
      if (obj.function?.name && toolNames.includes(obj.function.name)) {
        let args = obj.function.arguments || obj.function.parameters || {};
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
      // NOTE: Models use "path" OR "file_path" — check both
      const fp = obj.file_path || obj.path || obj.filename || '';
      if (fp && (obj.content || obj.code || obj.text)) {
        results.push({ name: 'create_file', args: { file_path: fp, content: obj.content || obj.code || obj.text } });
        return true;
      }
      if (fp && (obj.find_text || obj.old_text || obj.search) && (obj.replace_text || obj.new_text || obj.replacement)) {
        results.push({
          name: 'find_and_replace', args: {
            file_path: fp,
            find_text: obj.find_text || obj.old_text || obj.search,
            replace_text: obj.replace_text || obj.new_text || obj.replacement
          }
        });
        return true;
      }
      if (fp && !obj.content && !obj.code && !obj.find_text && !obj.old_text) {
        results.push({ name: 'read_file', args: { file_path: fp } });
        return true;
      }
      if (obj.dir_path || obj.directory || obj.folder) {
        results.push({ name: 'list_files', args: { dir_path: obj.dir_path || obj.directory || obj.folder } });
        return true;
      }
      // Detect search_code from bare arguments
      if (obj.pattern || obj.search_pattern || obj.query) {
        results.push({ name: 'search_code', args: { pattern: obj.pattern || obj.search_pattern || obj.query, ...obj } });
        return true;
      }
      return false;
    };

    // Pre-process: decode HTML entities BEFORE JSON parsing (model outputs &quot; etc)
    const cleanedText = decodeHtmlEntities(text);

    // Strategy 1: Find all markdown JSON blocks
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
    let match;
    while ((match = codeBlockRegex.exec(cleanedText)) !== null) {
      const jsonContent = match[1].trim();
      try {
        const obj = JSON.parse(jsonContent);
        if (processParsedObject(obj)) continue;
      } catch {
        // Try fixing incomplete JSON inside code block
        const closingSuffixes = ['}', '"}', '"}]', '}]}', '"}]}'];
        for (const suffix of closingSuffixes) {
          try {
            const obj = JSON.parse(jsonContent + suffix);
            if (processParsedObject(obj)) {
              console.log(`[CodeNative AI] Strategy 1: Fixed incomplete JSON block with suffix "${suffix}"`);
              break;
            }
          } catch { }
        }
      }
    }

    if (results.length > 0) return results;

    // Strategy 2: Find largest { ... } substring and parse
    const firstBrace = cleanedText.indexOf('{');
    const lastBrace = cleanedText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const possibleJson = cleanedText.substring(firstBrace, lastBrace + 1);
      try {
        const obj = JSON.parse(possibleJson);
        processParsedObject(obj);
      } catch { }
    }

    if (results.length > 0) return results;

    // Strategy 2.5: Try fixing incomplete JSON (model may have been cut off)
    if (firstBrace !== -1) {
      const incompleteJson = cleanedText.substring(firstBrace);
      const closingSuffixes = ['}', '"}', '"}]', '}]}', '"}]}', '"}}', '"}}}'];
      for (const suffix of closingSuffixes) {
        try {
          const obj = JSON.parse(incompleteJson + suffix);
          if (processParsedObject(obj)) {
            console.log(`[CodeNative AI] Strategy 2.5: Fixed incomplete JSON with suffix "${suffix}"`);
            break;
          }
        } catch { }
      }
    }

    if (results.length > 0) return results;

    // Strategy 3: Auto-extract raw code blocks when model dumps code instead of calling tools
    // Detect: the model output contains a fenced code block (```java ... ```) AND mentions a file path
    // This handles the case where the model outputs code explanation + code block instead of tool calling
    if (this._workspaceRoot) {
      const codeBlockContentRegex = /```(?:java|python|javascript|typescript|c|cpp|go|rust|html|css|json|xml|yaml|sh|bash|ruby|php|swift|kotlin|scala|dart|r|sql)\s*\n([\s\S]*?)```/gi;
      let codeMatch;
      while ((codeMatch = codeBlockContentRegex.exec(text)) !== null) {
        const codeContent = codeMatch[1].trim();
        if (codeContent.length < 10) continue; // skip tiny snippets

        // Find a file path mentioned in the text (either absolute or bare filename)
        const absPathMatch = text.match(/[A-Za-z]:[\\/][\w\\/.\\-]+\.\w+/);
        const bareFileMatch = text.match(/\b([A-Za-z0-9_\-]+\.(java|py|js|ts|tsx|jsx|c|cpp|h|go|rs|html|css|json|xml|yaml|yml|sh|rb|php|swift|kt|scala|dart|r|sql))\b/i);

        let targetPath = '';
        if (absPathMatch) {
          targetPath = cleanFilePath(absPathMatch[0]);
        } else if (bareFileMatch) {
          targetPath = path.join(this._workspaceRoot, bareFileMatch[1]);
        }

        if (targetPath) {
          console.log(`[CodeNative AI] Strategy 3: Auto-extracting code block → ${targetPath}`);
          results.push({
            name: 'create_file',
            args: { file_path: targetPath, content: codeContent },
          });
        }
      }
    }

    return results;
  }

  // ======================== CODE COMPLETION ========================

  async requestCompletion(input: IAICompletionOption, cancelToken?: CancellationToken) {
    const model = this.modelName;
    try {
      const controller = new AbortController();
      cancelToken?.onCancellationRequested(() => controller.abort());

      // Call Ollama directly
      const prompt = `Complete the following code. Only output the completion, no explanation:\n\`\`\`\n${input.prompt}\n\`\`\``;

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
