import { Autowired, Injectable } from '@opensumi/di';
import { ClientAppContribution, Domain, IClientApp, PreferenceService } from '@opensumi/ide-core-browser';
import { IStatusBarService, StatusBarAlignment } from '@opensumi/ide-core-browser/lib/services';
import { AIBackSerivcePath, IAIBackService, MaybePromise } from '@opensumi/ide-core-common';
import { ModelSettingId } from '../common';

const OLLAMA_STATUS_ID = 'ollama-connection-status';

@Domain(ClientAppContribution)
export class OllamaStatusContribution implements ClientAppContribution {
    @Autowired(IStatusBarService)
    private readonly statusBarService: IStatusBarService;

    @Autowired(AIBackSerivcePath)
    private readonly aiBackService: IAIBackService;

    private statusBarAccessor: any;
    private checkInterval: NodeJS.Timeout | undefined;

    onDidStart(app: IClientApp): MaybePromise<void> {
        // Add initial status bar element
        this.statusBarAccessor = this.statusBarService.addElement(OLLAMA_STATUS_ID, {
            text: '$(sync~spin) AI',
            tooltip: 'Checking AI backend and Ollama connection...',
            alignment: StatusBarAlignment.RIGHT,
            priority: 100,
            color: '#999999',
        });

        // Check immediately and then every 30 seconds
        this.checkOllamaStatus();
        this.checkInterval = setInterval(() => this.checkOllamaStatus(), 30000);
    }

    private async checkOllamaStatus() {
        try {
            // @ts-ignore - checkOllamaStatus is a custom method added to our implementation
            const isOnline = await this.aiBackService.checkOllamaStatus();

            if (isOnline) {
                this.statusBarService.setElement(OLLAMA_STATUS_ID, {
                    text: '$(check) AI',
                    tooltip: 'Ollama is running. BM25 + vector hybrid RAG context is active.',
                    color: '#89d185',
                });
            } else {
                this.setOfflineStatus();
            }
        } catch {
            this.setOfflineStatus();
        }
    }

    private setOfflineStatus() {
        this.statusBarService.setElement(OLLAMA_STATUS_ID, {
            text: '$(error) AI',
            tooltip: 'Ollama is not running. Start it with: ollama serve',
            color: '#f48771',
        });
    }
}
