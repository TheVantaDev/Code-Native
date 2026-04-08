# CodeNative IDE — Review Document

> **Project Title:** CodeNative — An Open-Source AI-Native Integrated Development Environment with Local LLM Integration
>
> **Date:** March 2026

---

## 1. Abstract

CodeNative is an open-source, AI-native Integrated Development Environment (IDE) built entirely using open-source technologies. It integrates local Large Language Models (LLMs) via Ollama to provide AI-powered features such as intelligent code completion, contextual chat assistance, code review, inline editing, and retrieval-augmented generation (RAG) — all running locally without cloud dependency. The project aims to democratize AI-assisted software development by eliminating vendor lock-in, ensuring data privacy, and enabling developers to leverage powerful AI capabilities on their own hardware.

---

## 2. Literature Survey

| # | Title of Research Paper | Authors | Methodology | Year | Key Contributions | Results |
|---|------------------------|---------|-------------|------|-------------------|---------|
| 1 | **The Design Space of LLM-Based AI Coding Assistants: An Analysis of 90 Systems in Academia and Industry** | Y. Jiang et al. (UC San Diego) | Meta-analysis of 90 AI coding assistant tools; HCI evaluation of features, paradigms, and user interaction patterns | 2025 | Comprehensive taxonomy of AI coding assistant features; identifies convergence in industry tools and divergence in academic prototypes; maps the full design space of LLM-based coding assistants | Found that modern AI coding assistants are evolving from code completion to agentic workflows; identified key gaps between academic research and industry products |
| 2 | **Towards Advancing Code Generation with Large Language Models: A Research Roadmap** | J. Wei et al. | Systematic survey of LLM-based code generation; proposes distillation framework for efficient code LLMs | 2025 (arXiv) | Proposes a research roadmap for LLM code generation; introduces framework to distill core components for practical, resource-efficient solutions | Demonstrates that smaller, specialized models can achieve competitive performance with larger models through knowledge distillation |
| 3 | **From Traditional RAG to Agentic and Non-Vector Reasoning Systems (PageIndex)** | PageIndex Research Team | Tree-structured hierarchical document indexing with LLM-powered agentic reasoning; eliminates vector databases | 2025 | Introduces vectorless RAG using hierarchical tree indexing; LLM reasons over document structure like a human expert; no embeddings or vector DB needed | Achieved 98.7% accuracy on FinanceBench vs ~50% for traditional vector-based RAG; significantly improved retrieval precision in domain-specific contexts |
| 4 | **Retrieval-Augmented Code Generation (RACG): A Comprehensive Survey** | S. Zhang et al. | Survey of retrieval-augmented approaches for code generation; analysis of external retrieval mechanisms for enhancing LLM context | 2024 (arXiv) | Categorizes RAG techniques for code: chunk-based, file-level, and repository-level retrieval; identifies privacy-preserving local RAG as key trend | Found that RAG significantly improves code generation accuracy, especially for repository-level tasks requiring cross-file context |
| 5 | **Impact of LLM-Powered Coding Assistants on Developer Productivity and Experience (watsonx)** | M. Agarwal et al. (IBM Research) | Mixed-methods study of LLM-powered coding assistant (watsonx Code Assistant) usage in enterprise; quantitative productivity metrics + qualitative developer interviews | 2024 (CHI 2025) | First large-scale enterprise study of AI coding assistant impact; measures real-world productivity gains; analyzes adoption patterns across developer experience levels | Productivity increases of 20-40% for routine tasks; benefits not uniformly distributed — senior developers gained more from complex suggestions while juniors benefited from boilerplate generation |
| 6 | **CodeGRAG: Extracting Composed Syntax Graphs for Retrieval-Augmented Cross-Lingual Code Generation** | L. Wang et al. | Graph-based code representation for cross-lingual RAG; extracts composed syntax graphs capturing semantic and logical code structure | 2024 | Bridges natural language and multiple programming languages using graph-based retrieval; captures deeper code semantics than text-based chunking | Outperformed baseline RAG approaches in cross-lingual code generation tasks; showed superior performance in mapping NL queries to code across Python, Java, and JavaScript |
| 7 | **A Collaborative Real-Time Code Editor: Architecture, Implementation, and Evaluation** | R. Sharma et al. (IJRASET) | Design and implementation of collaborative code editor using React.js, Node.js, Socket.IO; conflict resolution via OT/CRDT | 2023 | Presents architecture for real-time collaborative editing in web-based editors; integrates communication channels within IDE; addresses conflict resolution | Successfully demonstrated real-time multi-user editing with sub-100ms latency; integrated chat and video communication within the editor |
| 8 | **Advanced Electron.js Architecture for Scalable Desktop Applications** | LogRocket Engineering | Architectural patterns for Electron applications: process separation, IPC optimization, modular design, security hardening | 2023 | Proposes advanced architectural patterns for complex Electron apps; addresses performance, security, and scalability; advocates for backend process extraction and message-passing architecture | Demonstrated reduced memory usage and improved responsiveness through process isolation and lazy module loading in Electron-based desktop apps |

---

## 3. Technology Stack

### 3.1 Complete OSS Stack Overview

| Layer | Technology | License | Purpose |
|-------|-----------|---------|---------|
| **IDE Framework** | OpenSumi | MIT | Core IDE framework (editor, file tree, terminal, extensions, themes) |
| **Desktop Runtime** | Electron | MIT | Cross-platform desktop app (Chromium + Node.js) |
| **UI Library** | React 18 | MIT | Frontend component rendering |
| **Language** | TypeScript | Apache-2.0 | Type-safe development across all layers |
| **Code Editor** | Monaco Editor | MIT | Core code editing engine (same as VS Code) |
| **Build System** | Webpack | MIT | Module bundling and compilation |
| **Package Manager** | pnpm / Yarn | MIT | Dependency management (monorepo) |
| **AI Runtime** | Ollama | MIT | Local LLM inference engine |
| **LLM Models** | Llama 3.1, DeepSeek-R1 | Meta / MIT | Language models for code generation and assistance |
| **Backend** | Express.js | MIT | API server for AI services and file operations |
| **Real-time Comm** | Socket.IO | MIT | WebSocket-based real-time communication |
| **RAG (Proposed)** | PageIndex (TypeScript impl.) | — | Vectorless retrieval-augmented generation |
| **Extension System** | VS Code Extensions (TextMate) | MIT | Language syntax, snippets, and language features |
| **Terminal** | node-pty | MIT | Pseudo-terminal for integrated terminal |
| **Version Control** | Git (built-in) | GPL-2.0 | Source control integration |

### 3.2 Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                     CodeNative IDE (Electron)                    │
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐    │
│  │              Browser Process (Renderer)                   │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │    │
│  │  │ Monaco   │ │ File     │ │ AI Chat  │ │ Terminal   │  │    │
│  │  │ Editor   │ │ Explorer │ │ Panel    │ │ (PTY)      │  │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────┘  │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │    │
│  │  │ Model    │ │ Status   │ │ Inline   │ │ Extension  │  │    │
│  │  │ Selector │ │ Bar      │ │ Chat     │ │ Marketplace│  │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────┘  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                           ▲ IPC / RPC                            │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │              Node Process (Backend)                       │    │
│  │  ┌──────────────┐ ┌───────────────┐ ┌────────────────┐  │    │
│  │  │ AIBackService│ │ FileService   │ │ SearchService  │  │    │
│  │  │ (Ollama API) │ │ (FS ops)      │ │ (grep/ripgrep) │  │    │
│  │  └──────┬───────┘ └───────────────┘ └────────────────┘  │    │
│  │         │                                                │    │
│  │  ┌──────▼───────┐ ┌───────────────┐ ┌────────────────┐  │    │
│  │  │ ModelService │ │ TreeIndex     │ │ Extension Host │  │    │
│  │  │ (config)     │ │ (PageIndex)   │ │ (VS Code ext)  │  │    │
│  │  └──────────────┘ └───────────────┘ └────────────────┘  │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                           │
                    HTTP (port 11434)
                           │
                 ┌─────────▼─────────┐
                 │     Ollama        │
                 │  ┌─────────────┐  │
                 │  │ Llama 3.1   │  │
                 │  │ DeepSeek-R1 │  │
                 │  │ CodeLlama   │  │
                 │  └─────────────┘  │
                 └───────────────────┘
```

---

## 4. Methodology

### 4.1 Development Philosophy — Open Source Software (OSS) First

CodeNative is built **entirely using open-source software**, following a community-driven development philosophy. Every component of the stack — from the IDE framework to the AI models — uses OSS with permissive licenses (MIT, Apache-2.0). This ensures:

- **Transparency**: All source code is publicly auditable
- **No Vendor Lock-in**: No dependency on proprietary APIs (OpenAI, Anthropic, etc.)
- **Data Privacy**: All AI processing happens locally — user code never leaves their machine
- **Community Contribution**: The project itself is open-source, encouraging contributions from the global developer community
- **Cost-Free AI**: No API usage fees — runs on consumer hardware via Ollama

### 4.2 Development Methodology

The project follows an **Agile iterative methodology** with the following phases:

#### Phase 1: Core IDE Foundation
- Adopted **OpenSumi** as the base IDE framework (fork of enterprise-grade IDE platform)
- Integrated **Electron** for cross-platform desktop packaging
- Set up **monorepo architecture** with separate packages for frontend, backend, and shared code
- Established modular architecture using **Dependency Injection (DI)** patterns

#### Phase 2: AI Integration — Local LLM
- Integrated **Ollama** as the local LLM inference runtime
- Built `AIBackService` — custom OpenSumi backend service that communicates directly with Ollama's REST API (`/api/generate`, `/api/tags`)
- Implemented streaming chat via **NDJSON** (Newline-Delimited JSON)
- Added model management system — dynamic model discovery, selection, and configuration via preferences
- Implemented lazy dependency injection to handle service lifecycle correctly

#### Phase 3: AI Features
- **AI Chat Panel**: Full conversational AI with chat history and streaming responses
- **Inline Chat**: Context-aware code explanations, optimizations, and transformations directly in the editor
- **Code Completion**: AI-powered autocomplete suggestions
- **Code Review & Explanation**: Automated code review and natural language explanations
- **Terminal Suggestions**: AI-assisted terminal command completion
- **Rename Suggestions**: Intelligent variable/function rename proposals
- **Problem Fix Provider**: AI-suggested fixes for linter errors and warnings

#### Phase 4: Retrieval-Augmented Generation (RAG) — Proposed
- Implementing **PageIndex-inspired tree-structured indexing** without vector databases
- Building hierarchical project index from file tree + function/class metadata
- LLM-powered reasoning over the tree to identify relevant code for user queries
- Pure TypeScript implementation — no Python dependency, no external services

#### Phase 5: Extension Ecosystem & Polishing
- Integrated **47 VS Code language extensions** for syntax highlighting (TypeScript, Java, Python, C++, etc.)
- **OpenVSX Marketplace** integration for community extensions
- Cross-platform packaging for Windows, macOS, and Linux

### 4.3 Key Design Decisions

| Decision | Choice Made | Rationale |
|----------|------------|-----------|
| LLM Provider | Ollama (local) over OpenAI/Anthropic (cloud) | Data privacy, zero cost, no internet required |
| RAG Approach | PageIndex (tree-based) over Vector DB (ChromaDB) | No embeddings needed, simpler architecture, higher accuracy |
| IDE Framework | OpenSumi over building from scratch | Enterprise-grade foundation, Monaco editor built-in, extension support |
| Desktop Framework | Electron over Tauri | Mature ecosystem, VS Code extension compatibility, Node.js native modules |
| Language | TypeScript over Python | Single language across entire stack (frontend + backend), type safety |
| Communication | Direct Ollama API over Express backend proxy | Eliminated separate backend dependency, simpler deployment |

### 4.4 System Workflow

```
Developer opens CodeNative IDE
        │
        ├──► Opens project folder → File Explorer & Editor loaded
        │
        ├──► AI Chat: Types question
        │       │
        │       ├──► AIBackService sends prompt to Ollama (:11434)
        │       ├──► Ollama generates response (streaming NDJSON)
        │       └──► Response streamed token-by-token to chat panel
        │
        ├──► Inline Chat: Selects code → "Explain" / "Optimize"
        │       │
        │       ├──► Code context + instruction sent to Ollama
        │       └──► AI response shown inline with diff view
        │
        ├──► Code Completion: Types code
        │       │
        │       ├──► Current context sent to Ollama (/api/generate)
        │       └──► Completion suggestion shown as ghost text
        │
        └──► RAG Query (Proposed): "How does auth work?"
                │
                ├──► TreeIndexService scans project structure
                ├──► Builds hierarchical index with summaries
                ├──► LLM reasons over tree → selects relevant files
                ├──► Reads selected files → sends as context
                └──► LLM generates comprehensive answer with references
```

---

## 5. Comparison with Existing Solutions

| Feature | **CodeNative (Ours)** | **VS Code + Copilot** | **Cursor** | **JetBrains AI** |
|---------|----------------------|----------------------|-----------|-----------------|
| Open Source | ✅ Fully OSS | Partial (editor OSS, AI proprietary) | ❌ Proprietary | ❌ Proprietary |
| Local LLM | ✅ Ollama (offline) | ❌ Cloud only | ❌ Cloud only | ❌ Cloud only |
| Data Privacy | ✅ 100% local | ❌ Code sent to cloud | ❌ Code sent to cloud | ❌ Code sent to cloud |
| Cost | ✅ Free | $10-19/month | $20/month | $8.33/month |
| RAG | ✅ PageIndex (proposed) | ❌ Limited | ✅ Codebase indexing | ✅ Basic |
| Inline Chat | ✅ | ✅ | ✅ | ✅ |
| Model Choice | ✅ Any Ollama model | ❌ GPT-4 only | Multiple (cloud) | Multiple (cloud) |
| Internet Required | ❌ Works offline | ✅ Required | ✅ Required | ✅ Required |

---

## 6. Objectives

1. Build a fully open-source, AI-native IDE that respects user privacy
2. Integrate local LLMs (Ollama) for code assistance without cloud dependency
3. Implement intelligent features: chat, inline edit, completion, review
4. Develop a novel vectorless RAG system (PageIndex) for codebase understanding
5. Create a contributor-friendly OSS project with comprehensive documentation
6. Support multiple programming languages through VS Code extension compatibility

---

## 7. Expected Outcomes

1. A production-ready, cross-platform AI-native IDE
2. Demonstration that local LLMs can provide competitive AI assistance without cloud services
3. Validation of PageIndex-style RAG for codebase understanding
4. Open-source contribution to the developer tools ecosystem
5. Research contribution on privacy-preserving AI-assisted development

---

## 8. References

1. Y. Jiang et al., "The Design Space of LLM-Based AI Coding Assistants: An Analysis of 90 Systems in Academia and Industry," UCSD, 2025.
2. J. Wei et al., "Towards Advancing Code Generation with Large Language Models: A Research Roadmap," arXiv preprint, 2025.
3. PageIndex Team, "PageIndex: Reasoning-Based RAG Without Vector Databases," pageindex.ai, 2025.
4. S. Zhang et al., "Retrieval-Augmented Code Generation: A Comprehensive Survey," arXiv:2407.xxxxx, 2024.
5. M. Agarwal et al., "Impact of LLM-Powered Coding Assistants on Developer Productivity," IBM Research, CHI 2025.
6. L. Wang et al., "CodeGRAG: Extracting Composed Syntax Graphs for Retrieval-Augmented Cross-Lingual Code Generation," arXiv, 2024.
7. R. Sharma et al., "A Collaborative Real-Time Code Editor," IJRASET, 2023.
8. "Advanced Electron.js Architecture for Scalable Desktop Applications," LogRocket, 2023.
9. OpenSumi, "OpenSumi — A Framework for Building IDE Products," github.com/opensumi, MIT License.
10. Ollama, "Get up and running with large language models locally," ollama.com, MIT License.
