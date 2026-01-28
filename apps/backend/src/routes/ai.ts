import { Router } from 'express';
import { ollamaService } from '../services/ollama';
import type { ChatRequest, ApiResponse, ChatResponse } from '@code-native/shared';

const router = Router();

// List available models
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

// Chat endpoint (streaming)
router.post('/chat', async (req, res) => {
    const { message, model, context, conversationId } = req.body as ChatRequest;

    if (!message) {
        return res.status(400).json({ success: false, error: 'Message is required' });
    }

    try {
        // Set headers for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const stream = await ollamaService.chat(message, model, context);

        for await (const chunk of stream) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();
    } catch (error) {
        console.error('Error in chat:', error);
        res.status(500).json({ success: false, error: 'Chat failed' });
    }
});

// Code completion
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

// Code review
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

// Explain code
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
