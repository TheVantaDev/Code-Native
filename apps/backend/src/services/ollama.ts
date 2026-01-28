import type { OllamaModel } from '@code-native/shared';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'llama3.2';

class OllamaService {
    private baseUrl: string;
    private defaultModel: string;

    constructor() {
        this.baseUrl = OLLAMA_URL;
        this.defaultModel = DEFAULT_MODEL;
    }

    // List available models
    async listModels(): Promise<OllamaModel[]> {
        const response = await fetch(`${this.baseUrl}/api/tags`);
        if (!response.ok) {
            throw new Error(`Failed to list models: ${response.statusText}`);
        }
        const data = await response.json();
        return data.models || [];
    }

    // Chat streaming
    async *chat(message: string, model?: string, context?: string): AsyncGenerator<{ content: string; done: boolean }> {
        const systemPrompt = context
            ? `You are an AI coding assistant. Use the following context to help answer: ${context}`
            : 'You are an AI coding assistant. Help the user with their coding questions.';

        const response = await fetch(`${this.baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model || this.defaultModel,
                prompt: message,
                system: systemPrompt,
                stream: true,
            }),
        });

        if (!response.ok) {
            throw new Error(`Chat failed: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim());

            for (const line of lines) {
                try {
                    const json = JSON.parse(line);
                    yield { content: json.response || '', done: json.done || false };
                } catch {
                    // Skip malformed JSON
                }
            }
        }
    }

    // Code completion
    async complete(code: string, language?: string, cursorPosition?: { line: number; column: number }): Promise<string> {
        const prompt = `Complete the following ${language || ''} code. Only output the completion, no explanation:
\`\`\`${language || ''}
${code}
\`\`\``;

        const response = await fetch(`${this.baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.defaultModel,
                prompt,
                stream: false,
            }),
        });

        if (!response.ok) {
            throw new Error(`Completion failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.response || '';
    }

    // Code review
    async review(code: string, language?: string, guidelines?: string): Promise<string> {
        const prompt = `Review the following ${language || ''} code for bugs, security issues, and best practices.${guidelines ? ` Follow these guidelines: ${guidelines}` : ''}

\`\`\`${language || ''}
${code}
\`\`\`

Provide:
1. Issues found (bugs, security, style)
2. Suggestions for improvement
3. Overall assessment`;

        const response = await fetch(`${this.baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.defaultModel,
                prompt,
                stream: false,
            }),
        });

        if (!response.ok) {
            throw new Error(`Review failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.response || '';
    }

    // Explain code
    async explain(code: string, language?: string): Promise<string> {
        const prompt = `Explain the following ${language || ''} code in detail:

\`\`\`${language || ''}
${code}
\`\`\`

Explain:
1. What the code does
2. How it works step by step
3. Key concepts used`;

        const response = await fetch(`${this.baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.defaultModel,
                prompt,
                stream: false,
            }),
        });

        if (!response.ok) {
            throw new Error(`Explain failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.response || '';
    }
}

export const ollamaService = new OllamaService();
