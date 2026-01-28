import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from 'dotenv';
import aiRouter from './routes/ai';
import executeRouter from './routes/execute';
import filesRouter from './routes/files';
import { setupWebSocket } from './services/websocket';

// Load environment variables
config();

const app = express();
const httpServer = createServer(app);

// Socket.IO setup
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
        methods: ['GET', 'POST'],
    },
});

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/ai', aiRouter);
app.use('/api/execute', executeRouter);
app.use('/api/files', filesRouter);

// WebSocket handlers
setupWebSocket(io);

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`🚀 CodeNative Backend running on http://localhost:${PORT}`);
    console.log(`📡 WebSocket server ready`);
    console.log(`🤖 Ollama API: ${process.env.OLLAMA_URL || 'http://localhost:11434'}`);
});

export { io };
