# CodeNative IDE

> **Enterprise AI-Powered IDE with Local LLM Support**

A fully open-source, privacy-first code editor that brings AI coding assistance to your machine without sending your code to the cloud.

---

## 🎯 What Makes This Different

| Feature | VS Code + Copilot | Cursor | **CodeNative** |
|---------|-------------------|--------|----------------|
| AI Provider | GitHub (cloud) | Multiple (cloud) | **Local (Ollama)** |
| Data Privacy | ❌ Code sent to servers | ❌ Code sent to servers | ✅ **100% local** |
| Cost | $10-19/month | $20/month | **Free forever** |
| Internet Required | Yes | Yes | **No** |
| Works Offline | No | No | **Yes** |
| Custom Models | No | Limited | **Any Ollama model** |
| Self-Hostable | No | No | **Yes** |

### Why We Built This

1. **Privacy** - Your code never leaves your machine
2. **Free** - No subscriptions, no API costs
3. **Offline** - Works on airplanes, in secure environments
4. **Custom** - Use any model (CodeLlama, DeepSeek, Mistral, etc.)
5. **Open** - Full source code, modify anything

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CodeNative IDE                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │   React + Vite  │  │   Monaco Editor │  │  Terminal   │ │
│  │   (Frontend)    │  │   (Code View)   │  │   (PTY)     │ │
│  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘ │
│           │                    │                   │        │
│           ▼                    ▼                   ▼        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Electron (Desktop Shell)                 │  │
│  │         IPC Bridge for native operations              │  │
│  └───────────────────────┬──────────────────────────────┘  │
│                          │                                  │
└──────────────────────────┼──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
       ┌───────────┐            ┌───────────┐
       │  Backend  │            │  Ollama   │
       │  :3001    │───────────►│  :11434   │
       │  Express  │   HTTP     │  Local AI │
       └───────────┘            └───────────┘
```

### Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| **Frontend** | React 18 + TypeScript | Modern, type-safe UI |
| **Editor** | Monaco Editor | Same engine as VS Code |
| **Desktop** | Electron + Vite | Native file access, terminal |
| **State** | Zustand | Simple, no boilerplate |
| **Backend** | Express + Socket.IO | REST + WebSocket ready |
| **AI** | Ollama | Local LLM runtime |
| **Terminal** | xterm.js + node-pty | Real shell integration |

---

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
