import { useState, useCallback, useEffect } from 'react';
import { ChatMessage, OllamaModel, OllamaConnectionStatus } from '../types';

interface UseOllamaReturn {
    messages: ChatMessage[];
    sendMessage: (prompt: string) => Promise<void>;
    isLoading: boolean;
    error: string | null;
    connectionStatus: OllamaConnectionStatus;
    clearMessages: () => void;
    // Model selection
    models: OllamaModel[];
    selectedModel: string;
    setSelectedModel: (model: string) => void;
    fetchModels: () => Promise<void>;
    // Retry connection
    retryConnection: () => Promise<void>;
}

const OLLAMA_BASE_URL = 'http://localhost:11434';
const STORAGE_KEY_MODEL = 'codenative_ollama_model';
const DEFAULT_MODEL = 'llama3.2';

export function useOllama(): UseOllamaReturn {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<OllamaConnectionStatus>('connecting');

    // Model state
    const [models, setModels] = useState<OllamaModel[]>([]);
    const [selectedModel, setSelectedModelState] = useState<string>(() => {
        // Load from localStorage
        if (typeof window !== 'undefined') {
            return localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_MODEL;
        }
        return DEFAULT_MODEL;
    });

    const setSelectedModel = useCallback((model: string) => {
        setSelectedModelState(model);
        localStorage.setItem(STORAGE_KEY_MODEL, model);
    }, []);

    // Fetch available models from Ollama
    const fetchModels = useCallback(async () => {
        try {
            setConnectionStatus('connecting');
            const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const modelList: OllamaModel[] = data.models || [];
            setModels(modelList);
            setConnectionStatus('connected');
            setError(null);

            // If current model not in list, select first available
            if (modelList.length > 0 && !modelList.find(m => m.name === selectedModel)) {
                setSelectedModel(modelList[0].name);
            }
        } catch (err) {
            console.error('Failed to fetch Ollama models:', err);
            setConnectionStatus('disconnected');
            setError('Cannot connect to Ollama. Make sure it\'s running on localhost:11434');
        }
    }, [selectedModel, setSelectedModel]);

    // Retry connection
    const retryConnection = useCallback(async () => {
        setError(null);
        await fetchModels();
    }, [fetchModels]);

    // Initial connection check
    useEffect(() => {
        fetchModels();
    }, [fetchModels]);

    const sendMessage = useCallback(async (prompt: string) => {
        if (!prompt.trim()) return;

        // Add user message
        const userMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: prompt,
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);
        setError(null);

        // Create placeholder for assistant message
        const assistantMessageId = crypto.randomUUID();
        const assistantMessage: ChatMessage = {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, assistantMessage]);

        try {
            // Build conversation context for multi-turn
            const conversationContext = messages
                .slice(-10) // Last 10 messages for context
                .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
                .join('\n\n');

            const fullPrompt = conversationContext
                ? `${conversationContext}\n\nUser: ${prompt}\n\nAssistant:`
                : prompt;

            const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: selectedModel,
                    prompt: fullPrompt,
                    stream: true,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            if (!response.body) {
                throw new Error('Response body is null');
            }

            setConnectionStatus('connected');

            // Read streaming response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim());

                for (const line of lines) {
                    try {
                        const json = JSON.parse(line);
                        if (json.response) {
                            fullContent += json.response;
                            // Update the assistant message with new content
                            setMessages(prev =>
                                prev.map(msg =>
                                    msg.id === assistantMessageId
                                        ? { ...msg, content: fullContent }
                                        : msg
                                )
                            );
                        }
                    } catch {
                        // Skip malformed JSON lines
                    }
                }
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';

            // Check if it's a connection error
            if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('Failed')) {
                setConnectionStatus('disconnected');
                setError('Cannot connect to Ollama. Make sure it\'s running on localhost:11434');
            } else {
                setError(errorMessage);
            }

            // Remove the empty assistant message on error
            setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId));
        } finally {
            setIsLoading(false);
        }
    }, [selectedModel, messages]);

    const clearMessages = useCallback(() => {
        setMessages([]);
        setError(null);
    }, []);

    return {
        messages,
        sendMessage,
        isLoading,
        error,
        connectionStatus,
        clearMessages,
        models,
        selectedModel,
        setSelectedModel,
        fetchModels,
        retryConnection,
    };
}
