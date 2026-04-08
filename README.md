<p align="center">
  <h1 align="center">🧬 CodeNative IDE</h1>
  <p align="center">
    <strong>An Open-Source, AI-Native IDE with Local LLM Integration</strong>
  </p>
  <p align="center">
    Privacy-first · Runs Offline · Free Forever · Fully Extensible
  </p>
</p>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Why CodeNative?](#why-codenative)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [RAG Pipeline](#rag-pipeline)
- [API Reference](#api-reference)
- [Docker Deployment](#docker-deployment)
- [Environment Variables](#environment-variables)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [License](#license)

---

## Overview

**CodeNative** is an open-source, AI-native Integrated Development Environment (IDE) built on top of the [OpenSumi](https://github.com/opensumi/core) framework and [Electron](https://www.electronjs.org/). It integrates **local Large Language Models** via [Ollama](https://ollama.com/) to deliver AI-powered coding assistance — including chat, code completion, inline editing, code review, and Retrieval-Augmented Generation (RAG) — all running **entirely on your machine** without any cloud dependency.

The project is structured as a **pnpm monorepo** with three main workspaces:

| Workspace | Description |
|-----------|-------------|
| `apps/desktop-new` | Electron + OpenSumi desktop IDE (primary frontend) |
| `apps/backend` | Express.js API server (AI, file ops, code execution, RAG) |
| `packages/shared` | Shared TypeScript types used across workspaces |

---

## Why CodeNative?

| Criteria | VS Code + Copilot | Cursor | **CodeNative** |
|----------|-------------------|--------|----------------|
| AI Provider | GitHub (cloud) | Multiple (cloud) | **Local (Ollama)** |
| Data Privacy | ❌ Code sent to servers | ❌ Code sent to servers | ✅ **100% local** |
| Cost | $10–19/month | $20/month | **Free forever** |
| Internet Required | Yes | Yes | **No** |
| Works Offline | No | No | **Yes** |
| Custom Models | No | Limited | **Any Ollama model** |
| Open Source | Partial | ❌ Proprietary | ✅ **Fully OSS** |

### Core Motivations

1. **Privacy** — Your source code never leaves your machine. All AI inference runs locally through Ollama.
2. **Zero Cost** — No subscriptions, no API keys, no usage limits. Runs on consumer hardware.
3. **Offline-First** — Works on airplanes, in air-gapped environments, and behind corporate firewalls.
4. **Model Freedom** — Use any Ollama-compatible model: CodeLlama, DeepSeek-R1, Llama 3, Mistral, Phi, and more.
5. **Fully Open** — MIT-licensed. Inspect, modify, and extend every layer of the stack.

---

## Features

### 🖥️ IDE Core
- **Monaco Editor** — The same editing engine as VS Code, with full syntax highlighting, IntelliSense, and multi-cursor support.
- **File Explorer** — Browse, create, rename, and delete files and directories.
- **Integrated Terminal** — Full pseudo-terminal via `xterm.js` + `node-pty` with shell integration.
- **Extension Support** — VS Code-compatible extensions via OpenVSX Marketplace. Ships with 47+ language extensions for syntax highlighting (TypeScript, Python, Java, C++, Rust, Go, etc.).
- **Search** — Project-wide text search powered by ripgrep.
- **Git Integration** — Built-in source control panel.

### 🤖 AI Features (Powered by Ollama)
- **AI Chat Panel** — Conversational AI assistant with streaming responses, chat history, and model selection.
- **Inline Chat** — Select code in the editor and ask the AI to explain, optimize, refactor, or debug it — results appear inline with a diff view.
- **Code Completion** — AI-powered autocomplete suggestions that appear as ghost text while typing.
- **Code Review** — Automated code review that checks for bugs, security vulnerabilities, and best practice violations.
- **Code Explanation** — Get natural language explanations of unfamiliar code.

### 📚 RAG (Retrieval-Augmented Generation)
- **Codebase-Aware AI** — The RAG pipeline indexes your entire project so the AI understands your codebase, not just the current file.
- **Hybrid Retrieval** — Combines BM25 (keyword-based) + ChromaDB (vector/semantic) search for high-precision context retrieval.
- **Structure-Aware Chunking** — Code files are split at function/class boundaries (not arbitrary line counts) to preserve semantic meaning.
- **Auto-Indexing** — Projects are automatically indexed when you start a RAG chat.

### 🔧 Code Execution
- **Multi-Language Runner** — Execute JavaScript, TypeScript, Python, and Java code directly within the IDE.
- **Output Panel** — View stdout, stderr, and execution time inline.

### 🌐 Real-Time Collaboration *(WebSocket-ready)*
- **Socket.IO Integration** — Backend is wired for real-time multi-user editing with live cursor sharing.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    CodeNative IDE (Electron)                      │
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐    │
│  │             Browser Process (Renderer)                    │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │    │
│  │  │ Monaco   │ │ File     │ │ AI Chat  │ │ Terminal   │  │    │
│  │  │ Editor   │ │ Explorer │ │ Panel    │ │ (xterm.js) │  │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────┘  │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │    │
│  │  │ Model    │ │ Status   │ │ Inline   │ │ Extension  │  │    │
│  │  │ Selector │ │ Bar      │ │ Chat     │ │ Marketplace│  │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────┘  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                          ▲ IPC / RPC                              │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │             Node Process (OpenSumi Backend)               │    │
│  │  ┌──────────────┐ ┌───────────────┐ ┌────────────────┐  │    │
│  │  │ AIBackService│ │ FileService   │ │ SearchService  │  │    │
│  │  │ (Ollama API) │ │ (FS ops)      │ │ (ripgrep)      │  │    │
│  │  └──────┬───────┘ └───────────────┘ └────────────────┘  │    │
│  │         │                                                │    │
│  │  ┌──────▼───────┐ ┌───────────────┐ ┌────────────────┐  │    │
│  │  │ ModelService │ │ RAG Indexer   │ │ Extension Host │  │    │
│  │  │ (config)     │ │ (BM25+Vector) │ │ (VS Code ext)  │  │    │
│  │  └──────────────┘ └───────────────┘ └────────────────┘  │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
          │                                         │
    HTTP (port 3001)                        HTTP (port 11434)
          │                                         │
 ┌────────▼────────┐                     ┌──────────▼──────────┐
 │  Express.js     │                     │      Ollama         │
 │  Backend API    │────────────────────►│  ┌────────────────┐ │
 │                 │      HTTP           │  │ Llama 3.2      │ │
 │  • AI routes    │                     │  │ DeepSeek-R1    │ │
 │  • RAG pipeline │                     │  │ CodeLlama      │ │
 │  • File ops     │                     │  │ (any model)    │ │
 │  • Code exec    │                     │  └────────────────┘ │
 └─────────────────┘                     └─────────────────────┘
```

### Data Flow

1. **User Action** → User types a question in the AI Chat Panel or triggers inline chat.
2. **Frontend → Backend** → Request sent via HTTP/SSE to the Express.js backend on port `3001`.
3. **RAG Context** → If the project is indexed, the backend retrieves relevant code chunks using hybrid BM25 + vector search.
4. **Backend → Ollama** → The user's question + retrieved context is sent to Ollama on port `11434`.
5. **Streaming Response** → Ollama streams the response back token-by-token via NDJSON. The backend re-streams via SSE to the frontend.
6. **UI Update** → The chat panel renders tokens in real time, producing the "typing" effect.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **IDE Framework** | [OpenSumi](https://github.com/opensumi/core) v3.8 | Enterprise IDE foundation with editor, file tree, terminal, extensions, Git, themes |
| **Desktop Runtime** | Electron 30 | Cross-platform desktop shell (Chromium + Node.js) |
| **Code Editor** | Monaco Editor | VS Code's editing engine — syntax highlighting, IntelliSense, diff view |
| **UI Library** | React 18 + TypeScript | Type-safe component rendering |
| **Build System** | Webpack 5 + Electron Forge | Module bundling, compilation, and desktop packaging |
| **Backend** | Express.js + TypeScript | REST API server for AI, files, execution, and RAG |
| **AI Runtime** | Ollama | Local LLM inference engine (Llama 3, DeepSeek, CodeLlama, etc.) |
| **RAG — Keyword** | BM25 (custom TypeScript) | Term-frequency based code retrieval |
| **RAG — Semantic** | ChromaDB + `nomic-embed-text` | Vector similarity search using embeddings |
| **Real-Time** | Socket.IO | WebSocket-based real-time collaboration layer |
| **Terminal** | xterm.js + node-pty | Integrated pseudo-terminal with shell access |
| **Package Manager** | pnpm (monorepo) / Yarn (desktop-new) | Dependency management |
| **Extension System** | VS Code Extensions (TextMate grammars) | Language syntax, snippets, and language features |
| **Shared Types** | `@code-native/shared` | TypeScript interfaces shared across frontend and backend |

---

## Project Structure

```
code-native/
├── apps/
│   ├── desktop-new/              # Primary Electron + OpenSumi IDE
│   │   ├── src/
│   │   │   ├── ai/               # AI module (browser, common, node layers)
│   │   │   │   ├── browser/      # AI chat panel, inline chat, model selector UI
│   │   │   │   ├── common/       # DI tokens, shared AI interfaces
│   │   │   │   └── node/         # AIBackService — Ollama communication, streaming
│   │   │   ├── core/             # Core IDE configuration and layout
│   │   │   │   ├── browser/      # App layout, theme, module registration
│   │   │   │   ├── common/       # Shared constants and interfaces
│   │   │   │   ├── electron-main/# Electron main process setup
│   │   │   │   └── node/         # Node-side services
│   │   │   ├── bootstrap/        # App startup and initialization
│   │   │   ├── i18n/             # Internationalization (en/zh)
│   │   │   └── logger/           # Custom logger configuration
│   │   ├── build/                # Webpack configs (electron, web, renderer)
│   │   ├── assets/               # Icons, images, extension bundles
│   │   ├── forge.config.ts       # Electron Forge packaging config
│   │   └── package.json
│   │
│   └── backend/                  # Express.js API Server
│       ├── src/
│       │   ├── server.ts         # Entry point — Express + Socket.IO setup
│       │   ├── routes/
│       │   │   ├── ai.ts         # AI endpoints (chat, complete, review, explain)
│       │   │   ├── rag.ts        # RAG endpoints (index, chat, status, reindex)
│       │   │   ├── files.ts      # File operations (tree, read, write)
│       │   │   └── execute.ts    # Code execution (JS, TS, Python, Java)
│       │   └── services/
│       │       ├── ollama.ts     # Ollama API client (streaming, completion, review)
│       │       ├── executor.ts   # Sandboxed code execution service
│       │       ├── websocket.ts  # Socket.IO event handlers
│       │       └── rag/
│       │           ├── fileIndexer.ts      # Project scanner + structure-aware chunking
│       │           ├── contextRetriever.ts # BM25 keyword search engine
│       │           ├── vectorRetriever.ts  # ChromaDB vector search engine
│       │           └── promptBuilder.ts    # RAG-enhanced prompt construction
│       ├── .env.example          # Environment variable template
│       └── package.json
│
├── packages/
│   └── shared/                   # @code-native/shared
│       └── src/
│           └── types.ts          # Shared TypeScript interfaces (ChatRequest, OllamaModel, etc.)
│
├── docker/
│   ├── docker-compose.yml        # Backend + Ollama + ChromaDB stack
│   └── Dockerfile.backend        # Backend container image
│
├── pnpm-workspace.yaml           # Monorepo workspace definition
├── package.json                  # Root scripts (dev, build, lint)
└── REVIEW_DOCUMENT.md            # Academic review document with literature survey
```

---

## Getting Started

### Prerequisites

| Requirement | Version | Installation |
|-------------|---------|--------------|
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org/) |
| **pnpm** | 8+ | `npm install -g pnpm` |
| **Yarn** | 4+ | Required for `desktop-new` workspace |
| **Ollama** | Latest | [ollama.com](https://ollama.com/) |
| **Git** | 2.0+ | [git-scm.com](https://git-scm.com/) |

### 1. Clone the Repository

```bash
git clone https://github.com/TheVantaDev/Code-Native.git
cd Code-Native
```

### 2. Install Dependencies

```bash
# Install root + backend + shared dependencies
pnpm install

# Install desktop-new dependencies (uses Yarn)
cd apps/desktop-new
yarn install
cd ../..
```

### 3. Start Ollama

```bash
# Install Ollama from https://ollama.com/
# Then pull a model:
ollama pull llama3.2

# Start Ollama (if not already running as a service):
ollama serve
```

### 4. Configure the Backend

```bash
# Copy the example environment file
cp apps/backend/.env.example apps/backend/.env

# Edit if needed (defaults work out of the box):
# PORT=3001
# OLLAMA_URL=http://localhost:11434
# DEFAULT_MODEL=llama3.2
```

### 5. Run the Application

```bash
# Start everything in parallel (backend + desktop)
pnpm dev

# — OR run individually —

# Backend only (port 3001):
pnpm dev:backend

# Desktop IDE only:
cd apps/desktop-new
yarn start
```

The IDE will launch as an Electron window. The backend runs on `http://localhost:3001`.

---

## RAG Pipeline

The Retrieval-Augmented Generation pipeline gives the AI full awareness of your codebase, not just the file you're editing.

### How It Works

```
User Query: "How does authentication work in this project?"
                │
                ▼
┌──────────────────────────────┐
│  1. File Indexer              │  Recursively scans project directory
│     • Structure-aware         │  Chunks code at function/class boundaries
│       chunking (TS/JS/        │  Uses sliding window for non-code files
│       Python/Java/Go/Rust)    │  Builds term frequency maps for BM25
│     • Sliding-window          │  Generates project file tree
│       fallback                │
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  2. Hybrid Retrieval          │
│     ┌────────┐ ┌───────────┐ │  BM25: keyword matching with TF-IDF
│     │ BM25   │ │ ChromaDB  │ │  ChromaDB: semantic similarity via embeddings
│     │(keyword)│ │ (vector)  │ │  Results merged and deduplicated
│     └────┬───┘ └─────┬─────┘ │
│          └─────┬─────┘       │
└────────────────┼─────────────┘
                 ▼
┌──────────────────────────────┐
│  3. Prompt Builder            │  Constructs system prompt with:
│     • Project file tree       │  • Project structure overview
│     • Top-K relevant chunks   │  • Code context from retrieval
│     • Active file context     │  • Current file in editor
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  4. Ollama LLM                │  Generates answer grounded in
│     Streaming response        │  your actual codebase
└──────────────────────────────┘
```

### Chunking Strategy

| File Type | Strategy | Details |
|-----------|----------|---------|
| Code files (TS, JS, Python, Java, Go, Rust, C++, etc.) | **Structure-aware** | Splits at `function`, `class`, `interface`, `def`, `struct`, etc. boundaries |
| Non-code files (JSON, YAML, Markdown, etc.) | **Sliding window** | 50-line chunks with 10-line overlap |
| Large blocks (>100 lines) | **Sub-chunking** | Oversized functions are further split via sliding window |

### Key Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `CHUNK_SIZE` | 50 lines | Lines per sliding-window chunk |
| `CHUNK_OVERLAP` | 10 lines | Overlap between consecutive chunks |
| `MAX_FILE_SIZE` | 100 KB | Files larger than this are skipped |
| `VECTOR_SEARCH_K` | 8 | Number of nearest neighbors from ChromaDB |
| `EMBEDDING_MODEL` | `nomic-embed-text` | Ollama model used for generating embeddings |

---

## API Reference

All endpoints are served by the Express.js backend on `http://localhost:3001`.

### AI Endpoints (`/api/ai`)

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| `GET` | `/api/ai/models` | List available Ollama models | JSON |
| `POST` | `/api/ai/chat` | Chat with AI (streaming) | SSE stream |
| `POST` | `/api/ai/complete` | Code completion | JSON |
| `POST` | `/api/ai/review` | Code review for bugs/security | JSON |
| `POST` | `/api/ai/explain` | Explain what code does | JSON |

#### Example: Chat with AI

```bash
curl -N http://localhost:3001/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Write a quicksort in Python", "model": "llama3.2"}'
```

### RAG Endpoints (`/api/rag`)

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| `POST` | `/api/rag/index` | Index a project directory | JSON |
| `POST` | `/api/rag/chat` | RAG-enhanced AI chat (streaming) | SSE stream |
| `GET` | `/api/rag/status` | Check index status | JSON |
| `POST` | `/api/rag/reindex` | Clear and rebuild the index | JSON |

#### Example: RAG Chat

```bash
curl -N http://localhost:3001/api/rag/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "How does the file indexer work?",
    "model": "llama3.2",
    "projectPath": "/path/to/your/project"
  }'
```

### File Endpoints (`/api/files`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/files/tree` | Get project file tree |
| `GET` | `/api/files/read` | Read file contents |
| `POST` | `/api/files/write` | Write/update file contents |

### Code Execution (`/api/execute`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/execute` | Execute code in a sandbox |
| `GET` | `/api/execute/languages` | List supported languages |

---

## Docker Deployment

Deploy the entire stack (Backend + Ollama + ChromaDB) with Docker Compose:

```bash
cd docker
docker-compose up -d
```

This starts three containers:

| Service | Port | Description |
|---------|------|-------------|
| `backend` | 3001 | Express.js API server |
| `ollama` | 11434 | Local LLM inference (GPU-accelerated if available) |
| `chromadb` | 8000 | Vector database for semantic search |

> **Note:** GPU passthrough is configured for NVIDIA GPUs. For CPU-only mode, remove the `deploy.resources.reservations` block from `docker-compose.yml`.

---

## Environment Variables

Create a `.env` file in `apps/backend/` (see `.env.example` for a template):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Backend server port |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |
| `DEFAULT_MODEL` | `llama3.2` | Default LLM model for AI requests |
| `PROJECT_ROOT` | `./workspace` | Default workspace directory |
| `CORS_ORIGIN` | `http://localhost:5173,http://localhost:8000` | Allowed CORS origins (comma-separated) |
| `CHROMA_URL` | `http://localhost:8000` | ChromaDB server URL (leave empty to skip vector search) |
| `CHROMA_COLLECTION` | `codenative_chunks` | ChromaDB collection name |
| `EMBEDDING_MODEL` | `nomic-embed-text` | Ollama model for generating embeddings |
| `VECTOR_SEARCH_K` | `8` | Number of vector search results to retrieve |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + \`` | Toggle integrated terminal |
| `Ctrl + B` | Toggle sidebar |
| `Ctrl + Shift + E` | Focus file explorer |
| `Ctrl + Shift + F` | Project-wide search |
| `Ctrl + P` | Quick file open |
| `Ctrl + Shift + P` | Command palette |

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](./apps/desktop-new/LICENSE) file for details.

---

<p align="center">
  Built with ❤️ using open-source software<br/>
  <sub>OpenSumi · Electron · Ollama · Monaco Editor · React · TypeScript</sub>
</p>
