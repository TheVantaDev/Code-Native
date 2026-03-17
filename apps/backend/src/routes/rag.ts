/**
 * rag.ts — RAG API Routes
 *
 * Endpoints for project indexing and RAG-enhanced AI chat.
 *
 * Endpoints:
 * - POST /api/rag/index   — Index a project directory
 * - POST /api/rag/chat    — RAG-enhanced chat (SSE streaming)
 * - GET  /api/rag/status  — Check indexing status
 * - POST /api/rag/reindex — Clear and re-index
 *
 * @author CodeNative Team
 */

import { Router } from 'express';
import { indexProject, isIndexed, getIndex, clearIndex } from '../services/rag/fileIndexer';
import { buildSystemPrompt, buildBasicPrompt } from '../services/rag/promptBuilder';
import { getIndexSummary } from '../services/rag/contextRetriever';
import { indexChunksIntoChroma, resetVectorIndex, isVectorIndexAvailable } from '../services/rag/vectorRetriever';
import { ollamaService } from '../services/ollama';

const router = Router();

/**
 * POST /api/rag/index
 *
 * Index a project directory for RAG retrieval.
 * Also triggers async ChromaDB vector indexing when available.
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

        // Kick off vector indexing in the background (non-blocking)
        indexChunksIntoChroma().catch(err =>
            console.warn('Vector indexing error (non-fatal):', err),
        );

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
    res.json({
        success: true,
        data: {
            ...getIndexSummary(),
            vectorIndexAvailable: isVectorIndexAvailable(),
        },
    });
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
        resetVectorIndex();
        const result = await indexProject(path);

        // Kick off vector indexing in the background
        indexChunksIntoChroma().catch(err =>
            console.warn('Vector reindex error (non-fatal):', err),
        );

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
 * 1. Retrieves relevant code chunks via hybrid BM25 + vector search
 * 2. Builds an enhanced system prompt with context
 * 3. Streams the LLM response back
 *
 * Body: {
 *   message: "Add a logout button to Header.tsx",
 *   model: "llama3.2",               // optional
 *   projectPath: "/path/to/project", // optional, triggers auto-index
 *   activeFile: {                    // optional
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
                // Fire-and-forget vector indexing
                indexChunksIntoChroma().catch(() => { /* non-fatal */ });
            } catch (e) {
                console.warn('Auto-indexing failed, proceeding without context:', e);
            }
        }

        // Build system prompt with RAG context (now async due to hybrid retrieval)
        const systemPrompt = isIndexed()
            ? await buildSystemPrompt({ query: message, activeFile })
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
        if (res.headersSent) {
            res.write(`data: ${JSON.stringify({ content: '\n\n[Error: Connection lost]', done: true })}\n\n`);
            res.end();
        } else {
            res.status(500).json({ success: false, error: 'RAG chat failed' });
        }
    }
});

export default router;

