/**
 * useOllama.ts - AI Chat Hook
 * 
 * This is the main hook that handles all communication with our backend API
 * which then talks to Ollama. We moved away from calling Ollama directly 
 * because routing through backend gives us more control (auth, rate limiting,
 * logging, etc).
 * 
 * How it works:
 * 1. User types a message in the AI panel
 * 2. This hook sends it to backend at localhost:3001/api/ai/chat
 * 3. Backend calls Ollama and streams the response back using SSE
 * 4. We parse the SSE chunks and update the UI in realtime
 * 
 * The streaming is important - without it user would have to wait for
 * the entire response before seeing anything. With streaming they see
 * words appearing as AI generates them (like ChatGPT).
 * 
 * @author CodeNative Team
 * @lastUpdated Feb 2026
 */

import { useState, useCallback, useEffect } from 'react';
import { ChatMessage, OllamaModel, OllamaConnectionStatus } from '../types';

/**
 * Options you can pass when sending a message
 * - systemPrompt: tells AI how to behave (e.g. "you are a coding assistant")
 * - context: project info like file tree, current file content etc
 */
interface SendMessageOptions {
    systemPrompt?: string;
    context?: string;
}

/**
 * Everything this hook returns - basically the full chat state and controls
 */
interface UseOllamaReturn {
    messages: ChatMessage[];                                    // All chat messages
    sendMessage: (prompt: string, options?: SendMessageOptions) => Promise<void>;
    isLoading: boolean;                                         // True while AI is responding
    error: string | null;                                       // Error message if something went wrong
    connectionStatus: OllamaConnectionStatus;                   // connected/disconnected/connecting
    clearMessages: () => void;                                  // Wipe chat history
    models: OllamaModel[];                                      // Available AI models
    selectedModel: string;                                      // Currently selected model
    setSelectedModel: (model: string) => void;                  // Change model
    fetchModels: () => Promise<void>;                           // Refresh models list
    retryConnection: () => Promise<void>;                       // Try reconnecting
}

// Backend API URL - this is where our Express server runs
// TODO: move this to env variable for production
const BACKEND_URL = 'http://localhost:3001';

// localStorage key for remembering user's model preference
const STORAGE_KEY_MODEL = 'codenative_ollama_model';

// Fallback model if user hasn't selected one and we cant get the list
const DEFAULT_MODEL = 'llama3.2';

export function useOllama(): UseOllamaReturn {
    // Chat messages array - both user and assistant messages
    const [messages, setMessages] = useState<ChatMessage[]>([]);

    // Loading state - true while waiting for AI response
    const [isLoading, setIsLoading] = useState(false);

    // Error message - null when everythings fine
    const [error, setError] = useState<string | null>(null);

    // Connection status - used to show the green/red dot in UI
    const [connectionStatus, setConnectionStatus] = useState<OllamaConnectionStatus>('connecting');

    // Available AI models from Ollama (llama3, codellama, mistral etc)
    const [models, setModels] = useState<OllamaModel[]>([]);

    // Currently selected model - persisted in localStorage so user
    // doesnt have to pick it every time they open the app
    const [selectedModel, setSelectedModelState] = useState<string>(() => {
        // Load saved preference on first render
        if (typeof window !== 'undefined') {
            return localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_MODEL;
        }
        return DEFAULT_MODEL;
    });

    /**
     * Update selected model and save to localStorage
     * This way the preference survives page refresh
     */
    const setSelectedModel = useCallback((model: string) => {
        setSelectedModelState(model);
        localStorage.setItem(STORAGE_KEY_MODEL, model);
    }, []);

    /**
     * Fetch available models from the backend
     * Backend calls Ollama's /api/tags endpoint and returns the list
     * 
     * This runs on mount and can be manually triggered via retryConnection
     */
    const fetchModels = useCallback(async () => {
        try {
            setConnectionStatus('connecting');

            // Hit our backend API (not Ollama directly anymore!)
            const response = await fetch(`${BACKEND_URL}/api/ai/models`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            // Backend wraps response in { success: bool, data: [...] }
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch models');
            }

            const modelList: OllamaModel[] = result.data || [];
            setModels(modelList);
            setConnectionStatus('connected');
            setError(null);

            // If users saved model isnt in the list anymore (maybe they deleted it),
            // automatically select the first available one
            if (modelList.length > 0 && !modelList.find(m => m.name === selectedModel)) {
                setSelectedModel(modelList[0].name);
            }
        } catch (err) {
            console.error('Failed to fetch models from backend:', err);
            setConnectionStatus('disconnected');
            setError('Cannot connect to backend. Make sure it\'s running on localhost:3001');
        }
    }, [selectedModel, setSelectedModel]);

    /**
     * Retry connection - just calls fetchModels again
     * Triggered when user clicks the retry button in the UI
     */
    const retryConnection = useCallback(async () => {
        setError(null);
        await fetchModels();
    }, [fetchModels]);

    // Check connection when component mounts
    // This shows the status indicator as soon as user opens AI panel
    useEffect(() => {
        fetchModels();
    }, [fetchModels]);

    /**
     * MAIN FUNCTION: Send a message to the AI
     * 
     * This is where the magic happens. Steps:
     * 1. Add user message to chat
     * 2. Create empty assistant message (placeholder for streaming)
     * 3. Build the full prompt with conversation context
     * 4. Send to backend via POST
     * 5. Read SSE stream and update assistant message in realtime
     * 
     * @param prompt - The user's message
     * @param options - Optional system prompt and context
     */
    const sendMessage = useCallback(async (prompt: string, options?: SendMessageOptions) => {
        if (!prompt.trim()) return;

        // Step 1: Add the user's message to chat immediately
        // This gives instant feedback before AI even starts responding
        const userMessage: ChatMessage = {
            id: crypto.randomUUID(),  // Generate unique ID
            role: 'user',
            content: prompt,
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);
        setError(null);

        // Step 2: Create a placeholder for the AI response
        // We'll update this as chunks come in from the stream
        const assistantMessageId = crypto.randomUUID();
        const assistantMessage: ChatMessage = {
            id: assistantMessageId,
            role: 'assistant',
            content: '',  // Empty initially, will fill as we stream
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, assistantMessage]);

        try {
            // Step 3: Build conversation context
            // We take last 10 messages to give AI some memory of the convo
            // More than 10 might exceed token limits on smaller models
            const conversationContext = messages
                .slice(-10)
                .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
                .join('\n\n');

            // Format the full message with history
            const fullMessage = conversationContext
                ? `${conversationContext}\n\nUser: ${prompt}`
                : prompt;

            // Build context string - this includes system prompt + project info
            // The AI will use this to understand its role and the codebase
            let contextString = '';
            if (options?.systemPrompt) {
                contextString += options.systemPrompt + '\n\n';
            }
            if (options?.context) {
                contextString += options.context;
            }

            // Step 4: Send to backend via POST
            // Backend will stream the response back as SSE (Server-Sent Events)
            const response = await fetch(`${BACKEND_URL}/api/ai/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: fullMessage,
                    model: selectedModel,
                    context: contextString || undefined,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            if (!response.body) {
                throw new Error('Response body is null');
            }

            setConnectionStatus('connected');

            // Step 5: Read the SSE stream
            // SSE format looks like: "data: {\"content\":\"hello\"}\n\n"
            // We parse each chunk and append to the message
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';
            let buffer = '';  // Buffer for incomplete events

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // Append new data to buffer and split by SSE delimiter
                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split('\n\n');

                // Keep last incomplete event in buffer (might get rest in next chunk)
                buffer = events.pop() || '';

                // Process each complete SSE event
                for (const event of events) {
                    if (!event.trim()) continue;

                    // Parse lines - SSE format is "data: <json>"
                    const lines = event.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);  // Remove "data: " prefix

                            // "[DONE]" marks end of stream
                            if (data === '[DONE]') {
                                continue;
                            }

                            try {
                                const json = JSON.parse(data);
                                if (json.content) {
                                    // Append new content and update the message
                                    fullContent += json.content;
                                    setMessages(prev =>
                                        prev.map(msg =>
                                            msg.id === assistantMessageId
                                                ? { ...msg, content: fullContent }
                                                : msg
                                        )
                                    );
                                }
                            } catch {
                                // Skip malformed JSON - sometimes happens with chunking
                            }
                        }
                    }
                }
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';

            // Check if its a connection error vs something else
            if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('Failed')) {
                setConnectionStatus('disconnected');
                setError('Cannot connect to backend. Make sure it\'s running on localhost:3001');
            } else {
                setError(errorMessage);
            }

            // Remove the empty placeholder message since we failed
            setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId));
        } finally {
            setIsLoading(false);
        }
    }, [selectedModel, messages]);

    /**
     * Clear chat history
     * Called when user clicks the trash icon
     */
    const clearMessages = useCallback(() => {
        setMessages([]);
        setError(null);
    }, []);

    // Return everything the component needs
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
