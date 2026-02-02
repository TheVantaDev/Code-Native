/**
 * ai.ts - AI API Routes (Backend)
 * 
 * These are the REST endpoints that the frontend calls.
 * All request handling and response formatting happens here.
 * Actual AI logic is in services/ollama.ts
 * 
 * Endpoints:
 * - GET  /api/ai/models   - List available AI models
 * - POST /api/ai/chat     - Chat with AI (streaming via SSE)
 * - POST /api/ai/complete - Code completion
 * - POST /api/ai/review   - Code review
 * - POST /api/ai/explain  - Explain code
 * 
 * All endpoints return JSON in this format:
 * { success: true/false, data: ..., error: "..." }
 * 
 * The chat endpoint is special - it uses SSE (Server-Sent Events)
 * for streaming responses instead of returning JSON all at once.
 * 
 * @author CodeNative Team
 * @lastUpdated Feb 2026
 */

import { Router } from 'express';
import { ollamaService } from '../services/ollama';
import type { ChatRequest, ApiResponse, ChatResponse } from '@code-native/shared';

const router = Router();

/**
 * GET /api/ai/models
 * 
 * List all available models in Ollama
 * Frontend uses this to populate the model dropdown
 * 
 * Response: { success: true, data: [{ name: "llama3.2", ... }] }
 */
router.get('/models', async (req, res) => {
    try {
        const models = await ollamaService.listModels();
        res.json({ success: true, data: models });
    } catch (error) {
        console.error('Error fetching models:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch models. Is Ollama running?'
        });
    }
});

/**
 * POST /api/ai/chat
 * 
 * THE MAIN ENDPOINT - chat with the AI
 * 
 * This uses Server-Sent Events (SSE) for streaming.
 * Instead of returning one big JSON response, we send chunks
 * as they come in from Ollama.
 * 
 * How SSE works:
 * 1. We set Content-Type to 'text/event-stream'
 * 2. We write data in format: "data: {json}\n\n"
 * 3. We send "[DONE]" when finished
 * 4. Client reads these chunks and updates UI
 * 
 * Request body:
 * {
 *   message: "user's question",
 *   model: "llama3.2",           // optional
 *   context: "system prompt...",  // optional
 *   conversationId: "abc123"      // optional, for future use
 * }
 * 
 * Response (SSE stream):
 * data: {"content": "Hello", "done": false}
 * data: {"content": " there", "done": false}
 * data: {"content": "!", "done": true}
 * data: [DONE]
 */
router.post('/chat', async (req, res) => {
    const { message, model, context, conversationId } = req.body as ChatRequest;

    // Validate input - message is required
    if (!message) {
        return res.status(400).json({ success: false, error: 'Message is required' });
    }

    try {
        // Set up SSE headers
        // These tell the browser this is a streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');  // Dont cache!
        res.setHeader('Connection', 'keep-alive');   // Keep socket open

        // Get streaming response from Ollama
        // ollamaService.chat() is an async generator
        const stream = ollamaService.chat(message, model, context);

        // Iterate over chunks as they come in
        for await (const chunk of stream) {
            // Format as SSE: "data: {json}\n\n"
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        // Signal end of stream
        res.write('data: [DONE]\n\n');
        res.end();
    } catch (error) {
        console.error('Error in chat:', error);
        res.status(500).json({ success: false, error: 'Chat failed' });
    }
});

/**
 * POST /api/ai/complete
 * 
 * Code completion - AI finishes your code
 * 
 * NOT streaming - returns full completion at once
 * Good for autocomplete suggestions
 * 
 * Request: { code: "function add(", language: "javascript" }
 * Response: { success: true, data: "a, b) { return a + b; }" }
 */
router.post('/complete', async (req, res) => {
    const { code, language, cursorPosition } = req.body;

    if (!code) {
        return res.status(400).json({ success: false, error: 'Code is required' });
    }

    try {
        const completion = await ollamaService.complete(code, language, cursorPosition);
        res.json({ success: true, data: completion });
    } catch (error) {
        console.error('Error in completion:', error);
        res.status(500).json({ success: false, error: 'Completion failed' });
    }
});

/**
 * POST /api/ai/review
 * 
 * Code review - AI checks code for issues
 * 
 * Request: { code: "...", language: "python", guidelines: "be strict" }
 * Response: { success: true, data: "Found 2 issues..." }
 */
router.post('/review', async (req, res) => {
    const { code, language, guidelines } = req.body;

    if (!code) {
        return res.status(400).json({ success: false, error: 'Code is required' });
    }

    try {
        const review = await ollamaService.review(code, language, guidelines);
        res.json({ success: true, data: review });
    } catch (error) {
        console.error('Error in review:', error);
        res.status(500).json({ success: false, error: 'Review failed' });
    }
});

/**
 * POST /api/ai/explain
 * 
 * Explain code - AI describes what code does
 * 
 * Request: { code: "...", language: "rust" }
 * Response: { success: true, data: "This function does..." }
 */
router.post('/explain', async (req, res) => {
    const { code, language } = req.body;

    if (!code) {
        return res.status(400).json({ success: false, error: 'Code is required' });
    }

    try {
        const explanation = await ollamaService.explain(code, language);
        res.json({ success: true, data: explanation });
    } catch (error) {
        console.error('Error in explain:', error);
        res.status(500).json({ success: false, error: 'Explanation failed' });
    }
});

export default router;
