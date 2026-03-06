import React, { useEffect, useState, useCallback } from 'react';
import { useInjectable, PreferenceService, getIcon } from '@opensumi/ide-core-browser';
import { Select } from '@opensumi/ide-core-browser/lib/components';
import { AIModelServicePath, IAIModelServiceProxy, ModelSettingId } from '../common';
import styles from './model-selector.module.less';

export const ModelSelector = () => {
    const preferenceService: PreferenceService = useInjectable(PreferenceService);
    const aiModelService: IAIModelServiceProxy = useInjectable(AIModelServicePath);

    const [models, setModels] = useState<string[]>([]);
    const [currentModel, setCurrentModel] = useState<string>('');
    const [loading, setLoading] = useState(false);

    const fetchModels = useCallback(async () => {
        setLoading(true);
        try {
            const modelList = await aiModelService.getOllamaModels();
            setModels(modelList);

            // Update current model if it's not in the list anymore or if it's empty
            const savedModel = preferenceService.get<string>(ModelSettingId.codeModelName);
            if (savedModel) {
                setCurrentModel(savedModel);
            } else if (modelList.length > 0) {
                setCurrentModel(modelList[0]);
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

    const handleChange = (value: string) => {
        setCurrentModel(value);
        preferenceService.set(ModelSettingId.codeModelName, value);
    };

    return (
        <div className={styles.model_selector_container}>
            <div className={styles.selector_wrapper}>
                <span className={getIcon('robot')} style={{ marginRight: '4px', fontSize: '14px', color: '#1677ff' }}></span>
                <Select
                    className={styles.model_select}
                    value={currentModel}
                    onChange={handleChange}
                    options={models.map(m => ({ label: m, value: m }))}
                    size="small"
                />
                <span
                    className={`${getIcon('refresh')} ${loading ? styles.spinning : ''} ${styles.refresh_icon}`}
                    onClick={fetchModels}
                    title="Refresh models"
                ></span>
            </div>
        </div>
    );
};
