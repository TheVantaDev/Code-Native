import React, { useEffect, useState, useCallback } from 'react';
import { useInjectable, PreferenceService, getIcon } from '@opensumi/ide-core-browser';
import { Select } from '@opensumi/ide-core-browser/lib/components';
import { MessageService } from '@opensumi/ide-overlay/lib/browser/message.service';
import { AIModelServicePath, IAIModelServiceProxy, ModelSettingId } from '../common';
import styles from './model-selector.module.less';

const POPULAR_MODELS = [
    'llama3.1',
    'llama3.2',
    'deepseek-r1:8b',
    'deepseek-r1:14b',
    'qwen2.5-coder:7b',
    'mistral',
    'codellama',
    'phi3',
];

export const ModelSelector = () => {
    const preferenceService: PreferenceService = useInjectable(PreferenceService);
    const aiModelService: IAIModelServiceProxy = useInjectable(AIModelServicePath);
    const messageService: MessageService = useInjectable(MessageService);

    const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
    const [currentModel, setCurrentModel] = useState<string>('');
    const [loading, setLoading] = useState(false);

    // Pulling state
    const [pullingModel, setPullingModel] = useState<string | null>(null);
    const [pullProgress, setPullProgress] = useState<string>('');

    const fetchModels = useCallback(async () => {
        setLoading(true);
        try {
            const modelList = await aiModelService.getOllamaModels();
            setDownloadedModels(modelList);

            // Get saved model from preferences
            const savedModel = preferenceService.get<string>(ModelSettingId.codeModelName);

            // If saved model exists in the list, use it
            if (savedModel && modelList.includes(savedModel)) {
                setCurrentModel(savedModel);
            } else if (modelList.length > 0) {
                // Auto-select first available model and persist it
                setCurrentModel(modelList[0]);
                preferenceService.set(ModelSettingId.codeModelName, modelList[0]);
            }
        } catch (error) {
            console.error('Failed to fetch models:', error);
        } finally {
            setLoading(false);
        }
    }, [aiModelService, preferenceService]);

    useEffect(() => {
        fetchModels();

        const disposable = preferenceService.onSpecificPreferenceChange(ModelSettingId.codeModelName, (change) => {
            setCurrentModel(change.newValue);
        });

        return () => disposable.dispose();
    }, [fetchModels, preferenceService]);

    const pullModel = async (modelName: string) => {
        try {
            setPullingModel(modelName);
            setPullProgress('Starting pull...');

            const response = await fetch('http://127.0.0.1:11434/api/pull', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: modelName })
            });

            if (!response.ok) {
                throw new Error(`Failed to pull model: ${response.statusText}`);
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
                        if (json.total && json.completed) {
                            const percent = Math.round((json.completed / json.total) * 100);
                            setPullProgress(`Pulling ${percent}%`);
                        } else if (json.status) {
                            setPullProgress(json.status);
                        }
                    } catch (e) { }
                }
            }

            // Success
            messageService.info(`Successfully pulled model ${modelName}`);
            await fetchModels(); // refresh list
            setCurrentModel(modelName);
            preferenceService.set(ModelSettingId.codeModelName, modelName);

        } catch (error: any) {
            console.error(error);
            messageService.error(`Error pulling model: ${error.message}`);
        } finally {
            setPullingModel(null);
            setPullProgress('');
        }
    };

    const handleChange = (value: string) => {
        if (pullingModel) return; // Prevent change while pulling

        if (downloadedModels.includes(value)) {
            setCurrentModel(value);
            preferenceService.set(ModelSettingId.codeModelName, value);
        } else {
            // It's a new model to pull
            // Before pulling, let's ask for confirmation
            pullModel(value);
        }
    };

    // Build options
    let options: { label: React.ReactNode, value: string }[] = [];

    if (pullingModel) {
        // While pulling, show only the pulling status so user sees what's happening
        options = [{
            label: (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span className={`${getIcon('cloud-download')} ${styles.spinning}`} style={{ marginRight: '6px' }}></span>
                    {pullProgress}
                </div>
            ),
            value: pullingModel
        }];
    } else {
        // 1. Downloaded models
        downloadedModels.forEach(m => {
            options.push({
                label: (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span className={getIcon('check')} style={{ marginRight: '6px', color: '#1677ff' }}></span>
                        {m}
                    </div>
                ),
                value: m
            });
        });

        // 2. Popular models to pull
        POPULAR_MODELS.forEach(m => {
            // Ensure we don't duplicate downloaded models (e.g. if llama3.1 is downloaded as llama3.1:latest)
            const isDownloaded = downloadedModels.some(d => d === m || d.startsWith(m + ':'));
            if (!isDownloaded) {
                options.push({
                    label: (
                        <div style={{ display: 'flex', alignItems: 'center', opacity: 0.6 }}>
                            <span className={getIcon('cloud-download')} style={{ marginRight: '6px' }}></span>
                            {m} <span style={{ fontSize: '10px', marginLeft: '6px' }}>(pull)</span>
                        </div>
                    ),
                    value: m
                });
            }
        });
    }

    return (
        <div className={styles.model_selector_container}>
            <div className={styles.selector_wrapper}>
                <span className={getIcon('robot')} style={{ marginRight: '4px', fontSize: '14px', color: '#1677ff' }}></span>
                <Select
                    className={styles.model_select}
                    value={pullingModel ? pullingModel : currentModel}
                    onChange={handleChange}
                    options={options}
                    size="small"
                />
                {!pullingModel && (
                    <span
                        className={`${getIcon('refresh')} ${loading ? styles.spinning : ''} ${styles.refresh_icon}`}
                        onClick={fetchModels}
                        title="Refresh models"
                    ></span>
                )}
            </div>
        </div>
    );
};
