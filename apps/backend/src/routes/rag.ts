/**
 * rag.ts — RAG API Routes
 * 
 * Endpoints for project indexing and RAG-enhanced AI chat.
 * 
 * Endpoints:
 * - POST /api/rag/index  — Index a project directory
 * - POST /api/rag/chat   — RAG-enhanced chat (SSE streaming)
 * - GET  /api/rag/status — Check indexing status
 * 
 * @author CodeNative Team
 */

import { Router } from 'express';
import { indexProject, isIndexed, getIndex, clearIndex } from '../services/rag/fileIndexer';
import { buildSystemPrompt, buildBasicPrompt } from '../services/rag/promptBuilder';
import { getIndexSummary } from '../services/rag/contextRetriever';
import { ollamaService } from '../services/ollama';

const router = Router();

/**
 * POST /api/rag/index
 * 
 * Index a project directory for RAG retrieval.
 * Should be called when user opens a folder.
 * 
 * Body: { projectPath: "/absolute/path/to/project" }
 */
router.post('/index', async (req, res) => {
    const { projectPath } = req.body;

    if (!projectPath) {
        return res.status(400).json({ success: false, error: 'projectPath is required' });
    }

    try {
        const result = await indexProject(projectPath);
        res.json({
            success: true,
            data: {
                totalFiles: result.totalFiles,
                totalChunks: result.totalChunks,
                indexedAt: result.indexedAt.toISOString(),
            },
        });
    } catch (error) {
        console.error('Error indexing project:', error);
        res.status(500).json({ success: false, error: 'Failed to index project' });
    }
});

/**
 * GET /api/rag/status
 * 
 * Check if a project is currently indexed
 */
router.get('/status', (req, res) => {
    res.json({ success: true, data: getIndexSummary() });
});

/**
 * POST /api/rag/reindex
 * 
 * Clear and re-index the current project
 */
router.post('/reindex', async (req, res) => {
    const { projectPath } = req.body;
    const path = projectPath || getIndex()?.rootPath;

    if (!path) {
        return res.status(400).json({ success: false, error: 'No project to reindex' });
    }

    try {
        clearIndex();
        const result = await indexProject(path);
        res.json({
            success: true,
            data: {
                totalFiles: result.totalFiles,
                totalChunks: result.totalChunks,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to reindex' });
    }
});

/**
 * POST /api/rag/chat
 * 
 * RAG-enhanced AI chat with streaming via SSE.
 * 
 * 1. Retrieves relevant code chunks from the indexed project
 * 2. Builds an enhanced system prompt with context
 * 3. Streams the LLM response back
 * 
 * Body: {
 *   message: "Add a logout button to Header.tsx",
 *   model: "llama3.2",           // optional
 *   projectPath: "/path/to/project",  // optional, triggers auto-index
 *   activeFile: {                     // optional
 *     path: "src/components/Header.tsx",
 *     content: "..."
 *   }
 * }
 */
router.post('/chat', async (req, res) => {
    const { message, model, projectPath, activeFile } = req.body;

    if (!message) {
        return res.status(400).json({ success: false, error: 'Message is required' });
    }

    try {
        // Auto-index if project path provided and not yet indexed
        if (projectPath && !isIndexed()) {
            try {
                await indexProject(projectPath);
            } catch (e) {
                console.warn('Auto-indexing failed, proceeding without context:', e);
            }
        }

        // Build system prompt with RAG context
        const systemPrompt = isIndexed()
            ? buildSystemPrompt({ query: message, activeFile })
            : buildBasicPrompt();

        // Set up SSE streaming headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Stream response from Ollama
        const stream = ollamaService.chat(message, model, systemPrompt);

        for await (const chunk of stream) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();
    } catch (error) {
        console.error('Error in RAG chat:', error);
        // If headers already sent (streaming started), just end
        if (res.headersSent) {
            res.write(`data: ${JSON.stringify({ content: '\n\n[Error: Connection lost]', done: true })}\n\n`);
            res.end();
        } else {
            res.status(500).json({ success: false, error: 'RAG chat failed' });
        }
    }
});

export default router;
