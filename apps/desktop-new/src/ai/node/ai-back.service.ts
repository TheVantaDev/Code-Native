import { pipeline } from 'node:stream';
import { Autowired, Injectable } from '@opensumi/di';
import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from '@opensumi/ide-ai-native/lib/common';
import { IAIBackService, IAICompletionOption, IAIReportCompletionOption, IAIBackServiceOption } from '@opensumi/ide-core-common';
import { IAIBackServiceResponse, IChatContent } from '@opensumi/ide-core-common/lib/types/ai-native';
import { CancellationToken, INodeLogger } from '@opensumi/ide-core-node';
import { BaseAIBackService, ChatReadableStream } from '@opensumi/ide-core-node/lib/ai-native/base-back.service';
import type { Response, fetch as FetchType } from 'undici-types';
import { ILogServiceManager } from '@opensumi/ide-logs';
import { AnthropicModel } from '@opensumi/ide-ai-native/lib/node/anthropic/anthropic-language-model';
import { DeepSeekModel } from '@opensumi/ide-ai-native/lib/node/deepseek/deepseek-language-model';
import { OpenAIModel } from '@opensumi/ide-ai-native/lib/node/openai/openai-language-model';
import { OpenAICompatibleModel } from '@opensumi/ide-ai-native/lib/node/openai-compatible/openai-compatible-language-model';

import { ChatCompletion, Completion } from './types';
import { AIModelService } from './model.service'

@Injectable()
export class AIBackService extends BaseAIBackService implements IAIBackService {
  private logger: INodeLogger

  @Autowired(ILogServiceManager)
  private readonly loggerManager: ILogServiceManager;

  @Autowired(AIModelService)
  modelService: AIModelService

  @Autowired(AnthropicModel)
  protected readonly anthropicModel: AnthropicModel;

  @Autowired(OpenAIModel)
  protected readonly openaiModel: OpenAIModel;

  @Autowired(DeepSeekModel)
  protected readonly deepseekModel: DeepSeekModel;

  @Autowired(OpenAICompatibleModel)
  protected readonly openAICompatibleModel: OpenAICompatibleModel;

  constructor() {
    super();
    this.logger = this.loggerManager.getLogger('ai' as any);
  }

  async checkOllamaStatus(): Promise<boolean> {
    const config = this.getCompletionConfig();
    if (!config) return false;

    try {
      let url = config.baseUrl;
      const urlObj = new URL(url);
      const healthUrl = `${urlObj.protocol}//${urlObj.host}/api/version`;

      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      return response.ok;
    } catch (error) {
      this.logger.error('Error checking Ollama status on node:', error);
      return false;
    }
  }

  override async requestStream(input: string, options: IAIBackServiceOption, cancelToken?: CancellationToken) {
    const chatReadableStream = new ChatReadableStream();
    cancelToken?.onCancellationRequested(() => {
      chatReadableStream.abort();
    });

    const model = options.model;

    if (model === 'openai') {
      this.openaiModel.request(input, chatReadableStream, options, cancelToken);
    } else if (model === 'deepseek') {
      this.deepseekModel.request(input, chatReadableStream, options, cancelToken);
    } else if (model === 'anthropic') {
      this.anthropicModel.request(input, chatReadableStream, options, cancelToken);
    } else {
      // For Ollama (or other compatible models), do a direct fetch since the built-in
      // OpenAICompatibleModel requires an API key and fails if it's not provided.
      this.requestOllamaStream(input, chatReadableStream, options, cancelToken);
    }

    return chatReadableStream;
  }

  private async requestOllamaStream(input: string, stream: ChatReadableStream, options: IAIBackServiceOption, cancelToken?: CancellationToken) {
    const config = this.getCompletionConfig();
    if (!config) {
      stream.emitError(new Error('Missing AI model configuration'));
      return;
    }

    // Default to the OpenAI-compatible completion endpoint if baseUrl ends with /v1
    // Otherwise assume it's a direct Ollama /api/chat endpoint
    let url = config.baseUrl;
    if (!url.endsWith('/')) url += '/';
    url = new URL('chat/completions', url).toString();

    // Parse the history and current input
    const messages: any[] = [];
    if (options.history) {
      messages.push(...options.history.map(msg => ({
        role: String(msg.role) === 'ai' ? 'assistant' : 'user',
        content: msg.content,
      })));
    }

    // Add current input
    messages.push({
      role: 'user',
      content: input,
    });

    try {
      const controller = new AbortController();
      cancelToken?.onCancellationRequested(() => controller.abort());

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.codeModelName || 'llama3.2',
          messages,
          stream: true,
          temperature: typeof config.codeTemperature === 'string' ? parseFloat(config.codeTemperature) : config.codeTemperature,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.status} ${await response.text()}`);
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
          if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const content = data.choices[0]?.delta?.content;
              if (content) {
                stream.emitData({ kind: 'content', content });
              }
            } catch (e) {
              this.logger.error('Failed to parse stream JSON chunk:', line);
            }
          }
        }
      }

      stream.end();
    } catch (error: any) {
      this.logger.error('Ollama stream error:', error);
      stream.emitError(error);
    }
  }

  async requestCompletion(input: IAICompletionOption, cancelToken?: CancellationToken) {
    const config = this.getCompletionConfig()
    if (!config) {
      return {
        sessionId: input.sessionId,
        codeModelList: [],
      }
    }

    const response = await this.fetchModel(
      this.getCompletionUrl(config.baseUrl, !config.codeFimTemplate),
      {
        stream: false,
        model: config.codeModelName,
        max_tokens: config.codeMaxTokens,
        temperature: config.codeTemperature,
        presence_penalty: config.codePresencePenalty,
        frequency_penalty: config.codeFrequencyPenalty,
        top_p: config.codeTopP,
        ...(config.codeFimTemplate ? {
          messages: [
            ...(config.codeSystemPrompt ? [
              {
                role: ChatCompletionRequestMessageRoleEnum.System,
                content: config.codeSystemPrompt,
              },
            ] : []),
            {
              role: ChatCompletionRequestMessageRoleEnum.User,
              content: config.codeFimTemplate.replace('{prefix}', input.prompt).replace('{suffix}', input.suffix || ''),
            }
          ]
        } : {
          prompt: input.prompt,
          suffix: input.suffix,
        })
      },
      cancelToken
    );

    if (!response.ok) {
      this.logger.error(`ai request completion failed: status: ${response.status}, body: ${await response.text()}`);
      return {
        sessionId: input.sessionId,
        codeModelList: [],
      }
    }

    try {
      const data = await response.json() as ChatCompletion | Completion
      const content = config.codeFimTemplate ? (data as ChatCompletion)?.choices?.[0]?.message?.content : (data as Completion)?.choices?.[0]?.text;
      if (!content) {
        return {
          sessionId: input.sessionId,
          codeModelList: [],
        }
      }
      return {
        sessionId: input.sessionId,
        codeModelList: [{ content }],
      }
    } catch (err: any) {
      this.logger.error(`ai request completion body parse error: ${err?.message}`);
      throw err
    }
  }

  private getCompletionConfig() {
    const { config } = this.modelService
    if (!config) {
      this.logger.warn('miss config')
      return null
    }
    if (!config.baseUrl) {
      this.logger.warn('miss config baseUrl')
      return null
    }
    const modelName = config.codeModelName
    if (!modelName) {
      this.logger.warn('miss config modelName')
      return null
    }
    return config;
  }

  private async fetchModel(url: string | URL, body: Record<string, any>, cancelToken?: CancellationToken): Promise<Response> {
    const controller = new AbortController();
    const signal = controller.signal;

    const { config } = this.modelService

    cancelToken?.onCancellationRequested(() => {
      controller.abort();
    });

    return fetch(
      url,
      {
        signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          ...(config?.apiKey ? {
            Authorization: `Bearer ${config.apiKey}`
          } : null),
        },
        body: JSON.stringify(body),
      },
    ) as unknown as Promise<Response>;
  }

  private getCompletionUrl(baseUrl: string, supportFim = false) {
    if (!baseUrl.endsWith('/')) {
      baseUrl += '/'
    }
    return new URL(supportFim ? 'completions' : 'chat/completions', baseUrl);
  }
}
