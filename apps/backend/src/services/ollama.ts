/**
 * ollama.ts - Ollama AI Service (Backend)
 * 
 * This service talks directly to Ollama (the local LLM server).
 * Frontend NEVER calls Ollama directly - it always goes thru this backend.
 * 
 * Why have this layer?
 * - We can add auth, rate limiting, logging later
 * - We can switch AI providers (OpenAI, Gemini) without changing frontend
 * - We can cache responses if needed
 * - We can run multiple Ollama instances and load balance
 * 
 * Ollama API endpoints we use:
 * - GET /api/tags - List available models
 * - POST /api/generate - Generate text (supports streaming)
 * 
 * @author CodeNative Team  
 * @lastUpdated Feb 2026
 */

import type { OllamaModel } from '@code-native/shared';

// Ollama server URL - can be configured via env variable
// Default is localhost because most users run Ollama locally
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// Default model to use if none specified
// llama3.2 is a good balance of speed vs quality for coding tasks
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'llama3.2';

/**
 * OllamaService - handles all Ollama interactions
 * 
 * Singleton class - we create one instance and export it
 */
class OllamaService {
    private baseUrl: string;
    private defaultModel: string;

    constructor() {
        this.baseUrl = OLLAMA_URL;
        this.defaultModel = DEFAULT_MODEL;
    }

    /**
     * List all models available in Ollama
     * 
     * Calls GET /api/tags which returns:
     * {
     *   "models": [
     *     { "name": "llama3.2:latest", "size": 4000000000, ... },
     *     { "name": "codellama:7b", ... }
     *   ]
     * }
     * 
     * @returns Array of model objects
     */
    async listModels(): Promise<OllamaModel[]> {
        const response = await fetch(`${this.baseUrl}/api/tags`);

        if (!response.ok) {
            throw new Error(`Failed to list models: ${response.statusText}`);
        }

        const data = await response.json();
        return data.models || [];
    }

    /**
     * MAIN FUNCTION: Stream a chat response from Ollama
     * 
     * This is an async generator - it yields chunks as they come in.
     * This is how we do streaming - we dont wait for the full response.
     * 
     * How streaming works:
     * 1. We send POST /api/generate with stream:true
     * 2. Ollama sends back chunks as NDJSON (newline-delimited JSON)
     * 3. Each chunk looks like: {"response": "Hello", "done": false}
     * 4. We parse each chunk and yield it
     * 5. When done:true, we stop
     * 
     * The frontend can then update the UI as each chunk arrives,
     * giving users that "typing" effect like ChatGPT.
     * 
     * @param message - The user's message
     * @param model - Which model to use (optional, uses default)
     * @param systemPrompt - System instructions for the AI (optional)
     */
    async *chat(message: string, model?: string, systemPrompt?: string): AsyncGenerator<{ content: string; done: boolean }> {
        // Use provided system prompt or fall back to basic one
        const finalSystemPrompt = systemPrompt ||
            'You are an AI coding assistant. Help the user with their coding questions.';

        // Send request to Ollama
        const response = await fetch(`${this.baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model || this.defaultModel,
                prompt: message,
                system: finalSystemPrompt,
                stream: true,  // This is the magic - enables streaming!
            }),
        });

        if (!response.ok) {
            throw new Error(`Chat failed: ${response.statusText}`);
        }

        // Get a reader for the response body stream
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();

        // Keep reading chunks until stream ends
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Decode bytes to text and split by newlines
            // Ollama sends one JSON object per line
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim());

            for (const line of lines) {
                try {
                    const json = JSON.parse(line);
                    // yield each chunk to the caller
                    yield { content: json.response || '', done: json.done || false };
                } catch {
                    // Skip malformed JSON - can happen at chunk boundaries
                }
            }
        }
    }

    /**
     * Code Completion - get AI to complete partial code
     * 
     * NOT streaming - waits for full response
     * Good for autocomplete suggestions (need full thing at once)
     * 
     * @param code - The partial code to complete
     * @param language - Programming language (helps AI)
     * @param cursorPosition - Where the cursor is (optional)
     */
    async complete(code: string, language?: string, cursorPosition?: { line: number; column: number }): Promise<string> {
        // Build a prompt that tells AI what we want
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
                stream: false,  // No streaming for completion
            }),
        });

        if (!response.ok) {
            throw new Error(`Completion failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.response || '';
    }

    /**
     * Code Review - get AI to review code for bugs
     * 
     * Asks AI to look for:
     * - Bugs and logic errors
     * - Security issues
     * - Style/best practice violations
     * 
     * @param code - The code to review
     * @param language - Programming language
     * @param guidelines - Any specific guidelines to follow
     */
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

    /**
     * Explain Code - get AI to explain what code does
     * 
     * Great for:
     * - Understanding unfamiliar codebases
     * - Learning new patterns
     * - Onboarding new team members
     * 
     * @param code - The code to explain
     * @param language - Programming language
     */
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

// Create singleton instance and export
export const ollamaService = new OllamaService();
