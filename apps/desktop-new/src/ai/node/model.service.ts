import { Injectable, Autowired, INJECTOR_TOKEN, Injector } from '@opensumi/di';
import { INodeLogger } from '@opensumi/ide-core-node'
import { IAIModelServiceProxy, IModelConfig } from '../common'
import { ILogServiceManager } from '@opensumi/ide-logs';
import { AIBackService } from './ai-back.service';

@Injectable()
export class AIModelService {
  @Autowired(ILogServiceManager)
  private readonly loggerManager: ILogServiceManager;

  @Autowired(INJECTOR_TOKEN)
  private readonly injector: Injector;

  #config: IModelConfig | undefined

  // Lazy logger — loggerManager is injected after constructor
  private _logger: INodeLogger | undefined;
  private get logger(): INodeLogger {
    if (!this._logger) {
      this._logger = this.loggerManager.getLogger('ai' as any);
    }
    return this._logger;
  }

  async getOllamaModels(): Promise<string[]> {
    const aiBackService = this.injector.get(AIBackService);
    return aiBackService.getOllamaModels();
  }

  get config(): IModelConfig | undefined {
    const config = this.#config
    if (!config) return
    return {
      ...config,
      codeTemperature: this.coerceNumber(config.codeTemperature, 0, 1, 0.2),
      codePresencePenalty: this.coerceNumber(config.codePresencePenalty, -2, 2, 1),
      codeFrequencyPenalty: this.coerceNumber(config.codeFrequencyPenalty, -2, 2, 1),
      codeTopP: this.coerceNumber(config.codeTopP, 0, 1, 0.95),
    }
  }

  async setConfig(config: IModelConfig): Promise<void> {
    this.#config = config;
    this.logger.log('[model config]', JSON.stringify(config));
  }

  private coerceNumber(value: string | number, min: number, max: number, defaultValue: number) {
    const num = Number(value)
    if (isNaN(num)) return defaultValue
    if (num < min || num > max) return defaultValue
    return num
  }
}

@Injectable()
export class AIModelServiceProxy implements IAIModelServiceProxy {
  @Autowired(AIModelService)
  private readonly modelService: AIModelService;

  async setConfig(config: IModelConfig): Promise<void> {
    this.modelService.setConfig(config)
  }

  async getOllamaModels(): Promise<string[]> {
    return this.modelService.getOllamaModels();
  }
}
