import { Injectable, Autowired, INJECTOR_TOKEN, Injector } from '@opensumi/di';
import { AIBackSerivceToken } from '@opensumi/ide-core-common/lib/types/ai-native';
import { IAIModelServiceProxy, IModelConfig } from '../common'
import { AIBackService } from './ai-back.service';

/**
 * RPC proxy — bridges browser → node for model config and model listing.
 * Resolves AIBackService via the DI token to ensure we get the SAME instance
 * that handles all AI requests (fixes the split-brain config bug).
 */
@Injectable()
export class AIModelServiceProxy implements IAIModelServiceProxy {
  @Autowired(INJECTOR_TOKEN)
  private readonly injector: Injector;

  private get aiBackService(): AIBackService {
    // Resolve via the DI token (AIBackSerivceToken) to get the singleton instance
    return this.injector.get(AIBackSerivceToken) as AIBackService;
  }

  async setConfig(config: IModelConfig): Promise<void> {
    this.aiBackService.setModelConfig(config);
  }

  async getOllamaModels(): Promise<string[]> {
    return this.aiBackService.getOllamaModels();
  }
}
