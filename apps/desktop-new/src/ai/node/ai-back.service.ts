import { Autowired, Injectable } from '@opensumi/di';
import { IAIBackService, IAICompletionOption, IAIBackServiceOption } from '@opensumi/ide-core-common';
import { CancellationToken, INodeLogger } from '@opensumi/ide-core-node';
import { BaseAIBackService, ChatReadableStream } from '@opensumi/ide-core-node/lib/ai-native/base-back.service';
import type { Response } from 'undici-types';
import { ILogServiceManager } from '@opensumi/ide-logs';

import { ChatCompletion, Completion } from './types';
import { AIModelService } from './model.service'

@Injectable()
export class AIBackService extends BaseAIBackService implements IAIBackService {
  private logger: INodeLogger

  @Autowired(ILogServiceManager)
  private readonly loggerManager: ILogServiceManager;

  @Autowired(AIModelService)
  modelService: AIModelService

  constructor() {
    super();
    this.logger = this.loggerManager.getLogger('ai' as any);
  }

  async checkOllamaStatus(): Promise<boolean> {
    try {
      // Check the custom backend's health
      const response = await fetch('http://127.0.0.1:3001/health', {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch (error) {
      this.logger.error('Error checking backend status:', error);
      return false;
    }
  }

  async getOllamaModels(): Promise<string[]> {
    try {
      const response = await fetch('http://127.0.0.1:3001/api/ai/models', {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) return [];

      const result = await response.json() as { success: boolean, data: { name: string }[] };
      if (result.success && Array.isArray(result.data)) {
        return result.data.map(m => m.name);
      }
      return [];
    } catch (error) {
      this.logger.error('Error fetching models from backend:', error);
      return [];
    }
  }

  override async requestStream(input: string, options: IAIBackServiceOption, cancelToken?: CancellationToken) {
    const chatReadableStream = new ChatReadableStream();
    cancelToken?.onCancellationRequested(() => {
      chatReadableStream.abort();
    });

    this.requestOllamaStream(input, chatReadableStream, options, cancelToken);

    return chatReadableStream;
  }

  private async requestOllamaStream(input: string, stream: ChatReadableStream, options: IAIBackServiceOption, cancelToken?: CancellationToken) {
    const config = this.getCompletionConfig();

    // Connect to the custom Express backend at :3001
    const url = 'http://127.0.0.1:3001/api/ai/chat';

    try {
      // Build the full message with history as the old frontend did
      const history = options.history?.slice(-10) || [];
      const conversationContext = history
        .map(msg => `${String(msg.role) === 'ai' ? 'Assistant' : 'User'}: ${msg.content}`)
        .join('\n\n');

      const fullMessage = conversationContext
        ? `${conversationContext}\n\nUser: ${input}`
        : input;

      const controller = new AbortController();
      cancelToken?.onCancellationRequested(() => controller.abort());

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: fullMessage, // Backend expects 'message'
          model: config?.codeModelName || 'llama3.2',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Backend request failed: ${response.status}`);
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
          const trimmedLine = line.trim();
          if (trimmedLine === '' || trimmedLine === 'data: [DONE]') continue;

          if (trimmedLine.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmedLine.slice(6));

              // Backend sends { content: "...", done: boolean }
              const content = data.content;

              if (content) {
                stream.emitData({ kind: 'content', content });
              }

              // Capture speed metrics if provided
              if (data.eval_count && data.eval_duration) {
                const speed = (data.eval_count / (data.eval_duration / 1e9)).toFixed(1);
                const speedInfo = `\n\n<small style="opacity: 0.5;">Speed: ${speed} tokens/s</small>`;
                stream.emitData({ kind: 'content', content: speedInfo });
              }
            } catch (e) {
              this.logger.error('Failed to parse stream JSON chunk:', trimmedLine);
            }
          }
        }
      }

      stream.end();
    } catch (error: any) {
      if (error.name === 'AbortError') {
        stream.end();
      } else {
        this.logger.error('Backend stream error:', error);
        stream.emitError(error);
      }
    }
  }

  async requestCompletion(input: IAICompletionOption, cancelToken?: CancellationToken) {
    // Inline completion would also go through the backend :3001/api/ai/complete
    const url = 'http://127.0.0.1:3001/api/ai/complete';

    try {
      const config = this.getCompletionConfig();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: input.prompt,
          language: (input as any).language || 'typescript',
          model: config?.codeModelName || 'llama3.2'
        }),
      });

      if (!response.ok) return { sessionId: input.sessionId, codeModelList: [] };

      const result = await response.json() as { success: boolean, data: string };
      if (result.success && result.data) {
        return {
          sessionId: input.sessionId,
          codeModelList: [{ content: result.data }],
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
