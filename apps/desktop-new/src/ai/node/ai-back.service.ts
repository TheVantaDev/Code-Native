import { Autowired, Injectable } from '@opensumi/di';
import { IAIBackService, IAICompletionOption, IAIBackServiceOption } from '@opensumi/ide-core-common';
import { CancellationToken, INodeLogger } from '@opensumi/ide-core-node';
import { BaseAIBackService, ChatReadableStream } from '@opensumi/ide-core-node/lib/ai-native/base-back.service';
import { ILogServiceManager } from '@opensumi/ide-logs';

import { AIModelService } from './model.service'
import { isIndexed, indexProject } from './rag/fileIndexer';
import { buildSystemPrompt } from './rag/promptBuilder';

// Talk directly to Ollama — no Express backend dependency
const OLLAMA_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'llama3.1';

@Injectable()
export class AIBackService extends BaseAIBackService implements IAIBackService {
  @Autowired(ILogServiceManager)
  private readonly loggerManager: ILogServiceManager;

  @Autowired(AIModelService)
  modelService: AIModelService

  // Lazy logger to avoid accessing loggerManager before DI injects it
  private _logger: INodeLogger | undefined;
  private get logger(): INodeLogger {
    if (!this._logger) {
      this._logger = this.loggerManager.getLogger('ai' as any);
    }
    return this._logger;
  }

  // Cache discovered models so we can auto-pick if no config is set
  private _cachedFirstModel: string | undefined;

  private get modelName(): string {
    return this.getCompletionConfig()?.codeModelName || this._cachedFirstModel || DEFAULT_MODEL;
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
        if (names.length > 0 && !this._cachedFirstModel) {
          this._cachedFirstModel = names[0];
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
   * Calls Ollama /api/generate with stream:false and returns full text.
   */
  override async request(input: string, options: IAIBackServiceOption, cancelToken?: CancellationToken) {
    try {
      const controller = new AbortController();
      cancelToken?.onCancellationRequested(() => controller.abort());

      let fullPrompt = input;
      if (!isIndexed()) {
          try {
              await indexProject(process.cwd());
          } catch(e) {}
      }

      if (isIndexed()) {
        const sysPrompt = await buildSystemPrompt({ query: input });
        fullPrompt = `${sysPrompt}\n\n${fullPrompt}`;
      }

      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          prompt: fullPrompt,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.status}`);
      }

      const result = await response.json() as { response?: string };
      return { data: result.response || '' };
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
   * Calls Ollama /api/generate with stream:true (NDJSON).
   */
  override async requestStream(input: string, options: IAIBackServiceOption, cancelToken?: CancellationToken) {
    const chatReadableStream = new ChatReadableStream();
    cancelToken?.onCancellationRequested(() => {
      chatReadableStream.abort();
    });

    this.streamFromOllama(input, chatReadableStream, options, cancelToken);

    return chatReadableStream;
  }

  private async streamFromOllama(input: string, stream: ChatReadableStream, options: IAIBackServiceOption, cancelToken?: CancellationToken) {
    try {
      // Build conversation context from history
      const history = options.history?.slice(-10) || [];
      const conversationContext = history
        .map(msg => `${String(msg.role) === 'ai' ? 'Assistant' : 'User'}: ${msg.content}`)
        .join('\n\n');

      let fullPrompt = conversationContext
        ? `${conversationContext}\n\nUser: ${input}`
        : input;

      if (!isIndexed()) {
          try {
              await indexProject(process.cwd());
          } catch(e) {}
      }

      if (isIndexed()) {
        const sysPrompt = await buildSystemPrompt({ query: input });
        fullPrompt = `${sysPrompt}\n\n${fullPrompt}`;
      }

      const controller = new AbortController();
      cancelToken?.onCancellationRequested(() => controller.abort());

      // Call Ollama directly — NDJSON streaming
      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          prompt: fullPrompt,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama stream failed: ${response.status}`);
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

            // Ollama NDJSON: { response: "token", done: false }
            if (json.response) {
              stream.emitData({ kind: 'content', content: json.response });
            }

            // Speed metrics on final chunk
            if (json.done && json.eval_count && json.eval_duration) {
              const speed = (json.eval_count / (json.eval_duration / 1e9)).toFixed(1);
              const speedInfo = `\n\n<small style="opacity: 0.5;">Speed: ${speed} tokens/s</small>`;
              stream.emitData({ kind: 'content', content: speedInfo });
            }
          } catch (e) {
            this.logger.error('Failed to parse Ollama NDJSON chunk:', trimmed);
          }
        }
      }

      stream.end();
    } catch (error: any) {
      if (error.name === 'AbortError') {
        stream.end();
      } else {
        this.logger.error('Ollama stream error:', error);
        stream.emitError(error);
      }
    }
  }

  /**
   * Code completion — non-streaming, for autocomplete suggestions.
   */
  async requestCompletion(input: IAICompletionOption, cancelToken?: CancellationToken) {
    try {
      const prompt = `Complete the following code. Only output the completion, no explanation:\n\`\`\`\n${input.prompt}\n\`\`\``;

      const controller = new AbortController();
      cancelToken?.onCancellationRequested(() => controller.abort());

      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          prompt,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) return { sessionId: input.sessionId, codeModelList: [] };

      const result = await response.json() as { response?: string };
      if (result.response) {
        return {
          sessionId: input.sessionId,
          codeModelList: [{ content: result.response }],
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

  private getCompletionConfig() {
    return this.modelService.config;
  }
}
