# CodeNative - Enterprise AI-Powered IDE

A secure, on-premise, AI-augmented development environment with local LLM support via Ollama.

## 🚀 Features

- **VS Code-like Interface** - Monaco Editor with syntax highlighting and IntelliSense
- **Local AI Assistant** - Chat with Ollama models for code help, completion, and reviews
- **Code Execution** - Run JavaScript, TypeScript, Python, and Java directly in the IDE
- **Integrated Terminal** - Full terminal access (Ctrl+`)
- **Real-time Collaboration** - Multi-user editing with live cursors (via WebSocket)
- **Docker Deployment** - Easy on-premise installation

## 📁 Project Structure

```
code-native/
├── apps/
│   ├── desktop/          # Electron + React frontend
│   └── backend/          # Express.js API server
├── packages/
│   └── shared/           # Shared TypeScript types
├── docker/               # Docker configs
└── pnpm-workspace.yaml   # Monorepo config
```

## 🛠️ Quick Start

### Prerequisites
- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Ollama running locally (`ollama serve`)

### Development

```bash
# Install all dependencies
pnpm install

# Run both frontend and backend
pnpm dev

# Run only desktop app
pnpm dev:desktop

# Run only backend
pnpm dev:backend
```

### Docker Deployment

```bash
cd docker
docker-compose up -d
```

## 🎯 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+\`` | Toggle Terminal |
| `Ctrl+B` | Toggle Sidebar |
| `Ctrl+Shift+E` | Explorer |
| `Ctrl+Shift+F` | Search |

## 📡 API Endpoints

### AI
- `GET /api/ai/models` - List Ollama models
- `POST /api/ai/chat` - Chat with AI (streaming)
- `POST /api/ai/complete` - Code completion
- `POST /api/ai/review` - Code review

### Code Execution
- `POST /api/execute` - Execute code
- `GET /api/execute/languages` - Supported languages

### Files
- `GET /api/files/tree` - File tree
- `GET /api/files/read` - Read file
- `POST /api/files/write` - Write file

## 🔧 Environment Variables

Create `.env` in `apps/backend/`:

```env
PORT=3001
OLLAMA_URL=http://localhost:11434
DEFAULT_MODEL=llama3.2
```

## 📄 License

MIT
