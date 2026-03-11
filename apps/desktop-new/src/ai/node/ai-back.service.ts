import { Autowired, Injectable } from '@opensumi/di';
import { IAIBackService, IAICompletionOption, IAIBackServiceOption } from '@opensumi/ide-core-common';
import { CancellationToken, INodeLogger, AppConfig } from '@opensumi/ide-core-node';
import { BaseAIBackService, ChatReadableStream } from '@opensumi/ide-core-node/lib/ai-native/base-back.service';
import { ILogServiceManager } from '@opensumi/ide-logs';
import * as fs from 'fs';
import * as path from 'path';

import { IModelConfig } from '../common'

// Talk directly to Ollama — no Express backend dependency
const OLLAMA_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'llama3.1';

// ===== MODULE-LEVEL CONFIG (immune to DI scoping — guaranteed single source of truth) =====
let _currentModelName: string = '';
let _currentConfig: IModelConfig | undefined;
let _cachedFirstModel: string | undefined;

function getActiveModel(): string {
  const model = _currentModelName || _cachedFirstModel || DEFAULT_MODEL;
  console.log('[CodeNative AI] getActiveModel() =>', model);
  return model;
}

// ===== TOOL DEFINITIONS for Ollama /api/chat =====
const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'create_new_file',
      description: 'Create a new file at the specified path with the given content. Use this when the user asks to create, make, or write a new file.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute file path where the file should be created, e.g. C:/Users/project/src/hello.ts'
          },
          content: {
            type: 'string',
            description: 'The full content to write into the file'
          }
        },
        required: ['file_path', 'content']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read the contents of a file at the specified path. Use this when the user asks to show, read, view, or open a file.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute file path to read'
          }
        },
        required: ['file_path']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_existing_file',
      description: 'Edit an existing file by replacing specific text. Use this when the user asks to modify, update, change, or fix code in a file.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute file path to edit'
          },
          search_text: {
            type: 'string',
            description: 'The exact text to find in the file (must match exactly)'
          },
          replace_text: {
            type: 'string',
            description: 'The text to replace the search_text with'
          }
        },
        required: ['file_path', 'search_text', 'replace_text']
      }
    }
  }
];

// ===== HTML ENTITY DECODER =====
// Models frequently output &quot; instead of " in tool arguments
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#34;/g, '"');
}

// ===== PATH CLEANUP =====
// Models often output file URIs or URL-encoded paths — normalize to OS paths
function cleanFilePath(rawPath: string): string {
  let p = rawPath.trim();
  // Remove file:// or file:/// prefix
  p = p.replace(/^file:\/\/\/?/, '');
  // Decode URI components (%3A → :, %20 → space, etc.)
  p = decodeURIComponent(p);
  // Decode HTML entities (&quot; → ", &amp; → &, etc.)
  p = p.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  // On Windows: if path starts with /C: or /c:, strip the leading /
  if (/^\/[a-zA-Z]:/.test(p)) {
    p = p.substring(1);
  }
  // Normalize slashes
  p = p.replace(/\//g, path.sep);
  return p;
}

// ===== TOOL EXECUTION =====
function executeToolCall(toolName: string, args: any): string {
  console.log(`[CodeNative AI] Executing tool: ${toolName}`, JSON.stringify(args));
  try {
    switch (toolName) {
      case 'create_new_file': {
        const filePath = cleanFilePath(args.file_path);
        const content = args.content || '';
        // Create parent directories if they don't exist
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, content, 'utf-8');
        return `[Tool success: File created at ${filePath}]`;
      }
      case 'read_file': {
        const filePath = cleanFilePath(args.file_path);
        if (!fs.existsSync(filePath)) {
          return `[Tool error: File not found at ${filePath}]`;
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        // Truncate very long files
        if (content.length > 5000) {
          return content.substring(0, 5000) + '\n... (truncated)';
        }
        return content;
      }
      case 'edit_existing_file': {
        const filePath = cleanFilePath(args.file_path);
        let searchText = args.search_text || '';
        let replaceText = args.replace_text || '';

        // Decode HTML entities that models often output
        searchText = decodeHtmlEntities(searchText);
        replaceText = decodeHtmlEntities(replaceText);

        if (!fs.existsSync(filePath)) {
          return `[Tool error: File not found at ${filePath}]`;
        }
        const content = fs.readFileSync(filePath, 'utf-8');

        // Try exact match first
        if (content.includes(searchText)) {
          const newContent = content.replace(searchText, replaceText);
          fs.writeFileSync(filePath, newContent, 'utf-8');
          return `[Tool success: File edited at ${filePath}]`;
        }

        // Fallback: try trimmed match (model might add extra whitespace)
        const trimmedSearch = searchText.trim();
        if (trimmedSearch && content.includes(trimmedSearch)) {
          const newContent = content.replace(trimmedSearch, replaceText);
          fs.writeFileSync(filePath, newContent, 'utf-8');
          return `[Tool success: File edited (fuzzy match) at ${filePath}]`;
        }

        // Fallback: try whitespace-normalized match
        const normalizeWS = (s: string) => s.replace(/\s+/g, ' ').trim();
        const normalizedSearch = normalizeWS(searchText);
        const lines = content.split('\n');
        // Try to find a line that contains the normalized search text
        for (let i = 0; i < lines.length; i++) {
          if (normalizeWS(lines[i]).includes(normalizedSearch)) {
            lines[i] = lines[i].replace(lines[i].trim(), replaceText.trim());
            fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
            return `[Tool success: File edited (line match) at ${filePath}]`;
          }
        }

        // Last resort: if the model gave us the ENTIRE new content as replace_text
        // and search_text looks like the old content, just write replace_text as is
        if (replaceText.includes('class ') || replaceText.includes('function ') || replaceText.includes('def ') || replaceText.includes('import ')) {
          fs.writeFileSync(filePath, replaceText, 'utf-8');
          return `[Tool success: File rewritten at ${filePath}]`;
        }

        return `[Tool error: Could not find the text to replace in ${filePath}.\nSearched for: "${searchText.substring(0, 100)}"\nFile starts with: "${content.substring(0, 200)}"]\nCRITICAL INSTRUCTION: Since edit_existing_file failed, you MUST use create_new_file with the entire updated file content instead. DO NOT retry edit_existing_file.`;
      }
      default:
        return `[Tool error: Unknown tool ${toolName}]`;
    }
  } catch (error: any) {
    return `[Tool error: ${error.message}]`;
  }
}

@Injectable()
export class AIBackService extends BaseAIBackService implements IAIBackService {
  @Autowired(ILogServiceManager)
  private readonly loggerManager: ILogServiceManager;

  @Autowired(AppConfig)
  private readonly appConfig: AppConfig;

  // Lazy logger to avoid accessing loggerManager before DI injects it
  private _logger: INodeLogger | undefined;
  private get logger(): INodeLogger {
    if (!this._logger) {
      this._logger = this.loggerManager.getLogger('ai' as any);
    }
    return this._logger;
  }

  /**
   * Called by AIModelServiceProxy when user changes model in the dropdown.
   * Stores to module-level variable so ALL instances see the same config.
   */
  setModelConfig(config: IModelConfig): void {
    _currentConfig = config;
    _currentModelName = config.codeModelName || '';
    console.log('[CodeNative AI] setModelConfig() => model:', _currentModelName || '(auto)');
    this.logger.log('[model config updated] model:', _currentModelName || '(auto)');
  }

  /**
   * Health check — ping Ollama directly
   */
  async checkOllamaStatus(): Promise<boolean> {
    try {
      const response = await fetch(OLLAMA_URL, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch (error) {
      this.logger.error('Error checking Ollama status:', error);
      return false;
    }
  }

  /**
   * List models from Ollama /api/tags
   */
  async getOllamaModels(): Promise<string[]> {
    try {
      const response = await fetch(`${OLLAMA_URL}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) return [];

      const result = await response.json() as { models: { name: string }[] };
      if (Array.isArray(result.models)) {
        const names = result.models.map(m => m.name);
        // Remember first model for auto-fallback
        if (names.length > 0 && !_cachedFirstModel) {
          _cachedFirstModel = names[0];
          console.log('[CodeNative AI] Cached first model:', _cachedFirstModel);
        }
        return names;
      }
      return [];
    } catch (error) {
      this.logger.error('Error fetching Ollama models:', error);
      return [];
    }
  }

  /**
   * Non-streaming request — used by inline chat, rename, code edits, etc.
   * Uses /api/chat for universal model compatibility.
   */
  override async request(input: string, options: IAIBackServiceOption, cancelToken?: CancellationToken) {
    const model = getActiveModel();
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

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.status} (model: ${model})`);
      }

      const result = await response.json() as { message?: { content?: string } };
      return { data: result.message?.content || '' };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return { data: '' };
      }
      this.logger.error('Ollama request error:', error);
      return { errorCode: error.message || 'Unknown error' };
    }
  }

  /**
   * Streaming request — used by chat panel, inline preview, terminal suggestions.
   */
  override async requestStream(input: string, options: IAIBackServiceOption, cancelToken?: CancellationToken) {
    const chatReadableStream = new ChatReadableStream();
    cancelToken?.onCancellationRequested(() => {
      chatReadableStream.abort();
    });

    this.streamFromOllama(input, chatReadableStream, options, cancelToken);

    return chatReadableStream;
  }

  /**
   * Main streaming method — uses /api/chat with messages[] format.
   * Supports tool calling for file operations (create, read, edit).
   * Auto-reads any file paths mentioned in user input so the model has context.
   */
  private async streamFromOllama(
    input: string,
    stream: ChatReadableStream,
    options: IAIBackServiceOption,
    cancelToken?: CancellationToken
  ) {
    const model = getActiveModel();

    try {
      // Build messages array from history
      const messages: { role: string; content: string }[] = [];

      // Add system prompt
      const systemPrompt = `You are an autonomous coding agent built into CodeNative IDE.
IMPORTANT RULES:
1. When editing a file, use "create_new_file" with the COMPLETE new file content. Do NOT use edit_existing_file unless you are sure of the exact text to find.
2. If your edit_existing_file attempt fails, DO NOT retry it. Immediately use create_new_file with the entire updated file content instead.
3. File paths must be plain OS paths like C:/Coding/coding/Solution.java (no file:// prefix).
4. Be concise. After a tool call, give a brief one-line summary of what you did.`;

      messages.push({
        role: 'system',
        content: systemPrompt
      });

      // Add conversation history
      const history = options.history?.slice(-10) || [];
      for (const msg of history) {
        messages.push({
          role: String(msg.role) === 'ai' ? 'assistant' : 'user',
          content: String(msg.content)
        });
      }

      // Auto-detect file paths in user input and pre-read them
      const filePathMatches = input.match(/[A-Za-z]:[\\\/][\w\\\/.\-]+\.\w+/g);
      let enrichedInput = input;
      if (filePathMatches) {
        for (const rawPath of filePathMatches) {
          const cleanPath = cleanFilePath(rawPath);
          if (fs.existsSync(cleanPath)) {
            try {
              const fileContent = fs.readFileSync(cleanPath, 'utf-8');
              const truncated = fileContent.length > 3000 ? fileContent.substring(0, 3000) + '\n...(truncated)' : fileContent;
              enrichedInput += `\n\n--- Current contents of ${cleanPath} ---\n${truncated}\n--- End of file ---`;
              console.log(`[CodeNative AI] Auto-read file: ${cleanPath} (${fileContent.length} bytes)`);
            } catch (e) {
              // Ignore read errors
            }
          }
        }
      }

      // Also try to find bare filenames in the workspace (DFS search)
      const bareFileMatches = input.match(/\b([A-Za-z0-9_\-]+\.[a-zA-Z0-9_\-]+)\b/g);
      if (bareFileMatches && this.appConfig?.workspaceDir) {
        let workspaceDir = this.appConfig.workspaceDir;
        if (workspaceDir.startsWith('file://')) {
          workspaceDir = workspaceDir.replace('file:///', '');
          workspaceDir = decodeURIComponent(workspaceDir);
          if (path.sep === '\\') workspaceDir = workspaceDir.replace(/\//g, '\\');
        }

        const searchWorkspaceForFile = (dir: string, fileName: string, maxDepth = 4, currentDepth = 0): string | null => {
          if (currentDepth > maxDepth) return null;
          try {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
              if (item.isDirectory()) {
                if (['node_modules', '.git', 'out', 'build', 'dist', 'target'].includes(item.name)) continue;
                const found = searchWorkspaceForFile(path.join(dir, item.name), fileName, maxDepth, currentDepth + 1);
                if (found) return found;
              } else if (item.name.toLowerCase() === fileName.toLowerCase()) {
                return path.join(dir, item.name);
              }
            }
          } catch { } // ignore permissions/missing dir errors
          return null;
        };

        for (const bareName of bareFileMatches) {
          // If already matched as an absolute path or the model name (e.g. llama3.1), skip
          if (bareName.toLowerCase().includes('llama3.1')) continue;
          if (filePathMatches?.some(p => p.toLowerCase().includes(bareName.toLowerCase()))) continue;

          const foundPath = searchWorkspaceForFile(workspaceDir, bareName);
          if (foundPath && !enrichedInput.includes(`--- Current contents of ${foundPath} ---`)) {
            try {
              const fileContent = fs.readFileSync(foundPath, 'utf-8');
              const truncated = fileContent.length > 3000 ? fileContent.substring(0, 3000) + '\n...(truncated)' : fileContent;
              enrichedInput += `\n\n--- Current contents of ${foundPath} ---\n${truncated}\n--- End of file ---`;
              console.log(`[CodeNative AI] Auto-read workspace file: ${foundPath}`);
            } catch (e) { }
          }
        }
      }

      // Add current user message (enriched with file contents)
      messages.push({ role: 'user', content: enrichedInput });

      const controller = new AbortController();
      cancelToken?.onCancellationRequested(() => controller.abort());

      console.log(`[CodeNative AI] streamFromOllama() => model: ${model}, messages: ${messages.length}`);

      // Agent loop — supports multiple rounds of tool calls (max 3)
      for (let round = 0; round < 3; round++) {
        const response = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            tools: TOOL_DEFINITIONS,
            stream: false,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          console.error(`[CodeNative AI] Ollama /api/chat failed: ${response.status}`, errText);
          throw new Error(`Ollama failed: ${response.status} (model: ${model})`);
        }

        const result = await response.json() as {
          message?: {
            role?: string;
            content?: string;
            tool_calls?: Array<{
              function: { name: string; arguments: Record<string, any> }
            }>;
          };
        };

        const assistantMessage = result.message;
        let hadToolCalls = false;

        // Check structured tool_calls
        if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
          hadToolCalls = true;
          console.log(`[CodeNative AI] Round ${round + 1}: ${assistantMessage.tool_calls.length} tool calls`);

          for (const toolCall of assistantMessage.tool_calls) {
            const toolName = toolCall.function.name;
            const toolArgs = toolCall.function.arguments;

            stream.emitData({ kind: 'content', content: `\n[Executing tool: ${toolName}]\n` });
            const toolResult = executeToolCall(toolName, toolArgs);
            stream.emitData({ kind: 'content', content: `${toolResult}\n\n` });

            messages.push({ role: 'assistant', content: assistantMessage.content || '' });
            messages.push({ role: 'tool', content: toolResult });
          }
          // Continue loop for next round
          continue;
        }

        // Check for tool calls in text content
        if (assistantMessage?.content) {
          const parsedToolCalls = this.tryParseToolCallFromText(assistantMessage.content);
          if (parsedToolCalls && parsedToolCalls.length > 0) {
            hadToolCalls = true;
            console.log(`[CodeNative AI] Round ${round + 1}: Parsed ${parsedToolCalls.length} tool(s) from text`);

            // Clean the JSON tool calls from the text so it doesn't leak into the UI
            let cleanText = assistantMessage.content.replace(/\{[\s\S]*?"name"\s*:\s*"(create_new_file|read_file|edit_existing_file)"[\s\S]*?\}/g, '').trim();
            if (cleanText) {
              stream.emitData({ kind: 'content', content: `${cleanText}\n\n` });
            }

            let allToolResults = '';
            for (const parsedToolCall of parsedToolCalls) {
              stream.emitData({ kind: 'content', content: `\n[Executing tool: ${parsedToolCall.name}]\n` });
              const toolResult = executeToolCall(parsedToolCall.name, parsedToolCall.args);
              stream.emitData({ kind: 'content', content: `${toolResult}\n\n` });
              allToolResults += `Result for ${parsedToolCall.name}: ${toolResult}\n`;
            }

            messages.push({ role: 'assistant', content: assistantMessage.content });
            messages.push({ role: 'user', content: `Tool results:\n${allToolResults}\nGive a brief summary. Do NOT output more tool calls unless requested.` });
            continue;
          }
        }

        // No tool calls — emit content and finish
        if (!hadToolCalls) {
          let finalContent = assistantMessage?.content || '';
          finalContent = finalContent.replace(/\{[\s\S]*?"name"\s*:\s*"(create_new_file|read_file|edit_existing_file)"[\s\S]*?\}/g, '').trim();
          if (finalContent) {
            stream.emitData({ kind: 'content', content: finalContent });
          }
          break;
        }
      }

      // Final streaming response after tool calls
      if (messages[messages.length - 1].role === 'tool' || messages[messages.length - 1].role === 'user') {
        const fetchResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            stream: false, // Don't stream the final summary either to prevent raw JSON from leaking
          }),
          signal: controller.signal,
        });
        const finalResult = await fetchResponse.json() as { message?: { content?: string } };
        let finalContent = finalResult.message?.content || '';

        // Strip out any trailing JSON tool calls from the final message
        finalContent = finalContent.replace(/\{[\s\S]*?"name"\s*:\s*"(create_new_file|read_file|edit_existing_file)"[\s\S]*?\}/g, '').trim();
        if (finalContent) {
          stream.emitData({ kind: 'content', content: finalContent });
        }
      } else {
        stream.end();
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        stream.end();
      } else {
        console.error('[CodeNative AI] Stream error:', error.message);
        this.logger.error('Ollama stream error:', error);
        stream.emitData({ kind: 'content', content: `\n\n❌ **Error:** ${error.message}` });
        stream.end();
      }
    }
  }

  /**
   * Try to extract a tool call from the model's text content.
   * Models sometimes output JSON like:
   *   {"name": "edit_file", "parameters": {"file_path": "...", ...}}
   * instead of using the structured tool_calls field.
   */
  private tryParseToolCallFromText(text: string): { name: string; args: Record<string, any> }[] {
    try {
      const results: { name: string; args: Record<string, any> }[] = [];

      // 1. Find JSON objects in the text that look like tool calls
      const jsonMatches = text.match(/\{[\s\S]*?"name"\s*:\s*"(create_new_file|read_file|edit_existing_file)"[\s\S]*?\}/g);
      if (jsonMatches && jsonMatches.length > 0) {
        for (const jsonStr of jsonMatches) {
          try {
            const parsed = JSON.parse(jsonStr);
            const toolName = parsed.name;
            const args = parsed.parameters || parsed.arguments || {};
            if (toolName && (toolName === 'create_new_file' || toolName === 'read_file' || toolName === 'edit_existing_file')) {
              results.push({ name: toolName, args });
            }
          } catch { continue; }
        }
      }

      if (results.length > 0) return results;

      // 2. Try to find deeply nested JSON (e.g. {"function": {"name": "...", "arguments": {...}}})
      const deepMatch = text.match(/\{[\s\S]*?"function"\s*:\s*\{[\s\S]*?"name"\s*:\s*"(create_new_file|read_file|edit_existing_file)"[\s\S]*?\}\s*\}/g);
      if (deepMatch && deepMatch.length > 0) {
        for (const jsonStr of deepMatch) {
          try {
            const parsed = JSON.parse(jsonStr);
            const fn = parsed.function;
            if (fn?.name) {
              results.push({ name: fn.name, args: fn.arguments || fn.parameters || {} });
            }
          } catch { continue; }
        }
      }

      if (results.length > 0) return results;

      // 3. Heuristic: Markdown create_file block or edit_file
      // Matches: create_new_file C:/path/to/file.ext\n```java\n...```
      const markdownCreateMatch = text.match(/(?:create_new_file|create_file|write_file|edit_existing_file|edit_file)[^\n]*?([A-Za-z]:[\\\/][\w\s\\\/.\-]+\.\w+|[\w\s\\\/.\-]+\.\w+)[\s\S]*?```[\w]*\n([\s\S]*?)```/i);
      if (markdownCreateMatch) {
        const filePath = markdownCreateMatch[1].trim();
        const content = markdownCreateMatch[2];
        return [{ name: 'create_new_file', args: { file_path: filePath, content: content } }];
      }

      // 4. Heuristic: simple markdown read_file request
      const markdownReadMatch = text.match(/(?:read_file|cat)[^\n]*?([A-Za-z]:[\\\/][\w\s\\\/.\-]+\.\w+|[\w\s\\\/.\-]+\.\w+)/i);
      if (markdownReadMatch) {
        return [{ name: 'read_file', args: { file_path: markdownReadMatch[1].trim() } }];
      }

      return [];
    } catch {
      return [];
    }
  }

  /**
   * Helper: do a streaming /api/chat call and pipe tokens to the stream.
   */
  private async doStreamingChat(
    model: string,
    messages: { role: string; content: string }[],
    stream: ChatReadableStream,
    controller: AbortController,
  ) {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama stream failed: ${response.status} (model: ${model})`);
    }

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

          // /api/chat NDJSON: { message: { content: "token" }, done: false }
          if (json.message?.content) {
            stream.emitData({ kind: 'content', content: json.message.content });
          }

          // Speed metrics on final chunk
          if (json.done && json.eval_count && json.eval_duration) {
            const speed = (json.eval_count / (json.eval_duration / 1e9)).toFixed(1);
            const speedInfo = `\n\n<small style="opacity: 0.5;">⚡ ${speed} tokens/s • ${model}</small>`;
            stream.emitData({ kind: 'content', content: speedInfo });
          }
        } catch (e) {
          // Skip unparseable lines
        }
      }
    }

    stream.end();
  }

  /**
   * Code completion — non-streaming, for autocomplete suggestions.
   */
  async requestCompletion(input: IAICompletionOption, cancelToken?: CancellationToken) {
    const model = getActiveModel();
    try {
      const controller = new AbortController();
      cancelToken?.onCancellationRequested(() => controller.abort());

      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'Complete the following code. Only output the completion, no explanation.' },
            { role: 'user', content: input.prompt }
          ],
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

    return {
      sessionId: input.sessionId,
      codeModelList: [],
    };
  }
}
