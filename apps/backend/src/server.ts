/**
 * server.ts - Backend Server Entry Point
 * 
 * This is the main file that starts everything.
 * It sets up:
 * - Express HTTP server
 * - Socket.IO for WebSockets
 * - CORS for frontend access
 * - API routes
 * 
 * The server runs on port 3001 by default.
 * Frontend (Electron) runs on 5173 and calls this.
 * 
 * Architecture:
 * 
 *   Frontend (:5173)     Backend (:3001)      Ollama (:11434)
 *        │                    │                     │
 *        ├───HTTP/SSE────────►│                     │
 *        │                    ├─────HTTP───────────►│
 *        │                    │◄────Streaming───────│
 *        │◄───SSE streaming───│                     │
 *        │                    │                     │
 *        └───WebSocket───────►│ (for future collab) │
 * 
 * @author CodeNative Team
 * @lastUpdated Feb 2026
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from 'dotenv';

// Import route handlers
import aiRouter from './routes/ai';
import executeRouter from './routes/execute';
import filesRouter from './routes/files';
import ragRouter from './routes/rag';

// Import WebSocket setup
import { setupWebSocket } from './services/websocket';

// Load environment variables from .env file
// This lets us configure OLLAMA_URL, PORT etc without changing code
config();

// Create Express app
const app = express();

// Wrap Express in HTTP server (needed for Socket.IO)
const httpServer = createServer(app);

/**
 * CORS Configuration
 * 
 * Supports comma-separated origins in CORS_ORIGIN env var so both
 * desktop-old (Vite :5173) and desktop-new web variant (:8000) can connect.
 * 
 * Electron node-process calls are not subject to CORS, but browser-renderer
 * calls (e.g. model pulls) need the correct origin allowed.
 */
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:8000')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

/**
 * Socket.IO Setup
 * 
 * We use Socket.IO for real-time features like:
 * - Live collaboration (multiple users editing same file)
 * - Real-time notifications
 * - Cursor position sharing
 * 
 * CORS is configured to allow all known frontend origins.
 */
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
    },
});

/**
 * Express CORS Middleware
 * 
 * Allows browser-side requests from any configured origin.
 * Requests with no origin (Electron node process, curl, etc.) are always allowed.
 * credentials: true allows cookies / auth headers.
 */
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (Electron node process, server-to-server, curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin ${origin} not allowed. Allowed origins: ${allowedOrigins.join(', ')}`));
    },
    credentials: true,
}));

// Parse JSON request bodies
// limit: '10mb' allows larger payloads (for file contents)
app.use(express.json({ limit: '10mb' }));

/**
 * Health Check Endpoint
 * 
 * Simple endpoint to check if server is running.
 * Frontend uses this to show connected/disconnected status.
 * 
 * Also useful for:
 * - Load balancer health checks
 * - Docker container health checks
 * - Monitoring systems
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * API Routes
 * 
 * /api/ai      - AI endpoints (chat, models, complete, review)
 * /api/execute - Code execution (run code, get output)
 * /api/files   - File operations (read, write, list)
 * /api/rag     - RAG-enhanced AI (index, chat with context)
 * 
 * All routes are prefixed with /api/ for clarity
 */
app.use('/api/ai', aiRouter);
app.use('/api/execute', executeRouter);
app.use('/api/files', filesRouter);
app.use('/api/rag', ragRouter);

// Set up WebSocket event handlers
// This handles join room, leave room, cursor sync etc
setupWebSocket(io);

/**
 * Start the server!
 * 
 * We use httpServer.listen() instead of app.listen()
 * because we need the HTTP server for Socket.IO
 */
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`🚀 CodeNative Backend running on http://localhost:${PORT}`);
    console.log(`📡 WebSocket server ready`);
    console.log(`🤖 Ollama API: ${process.env.OLLAMA_URL || 'http://localhost:11434'}`);
});

// Export io instance so other modules can emit events
export { io };
