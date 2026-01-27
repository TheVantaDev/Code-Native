// File System Types
export interface FileNode {
    id: string;
    name: string;
    path: string;
    type: 'file' | 'folder';
    children?: FileNode[];
    language?: string;
}

// Editor Types
export interface OpenFile {
    id: string;
    name: string;
    path: string;
    content: string;
    language: string;
    isDirty: boolean;
}

// AI Chat Types
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

// UI Types
export type SidebarView = 'files' | 'search' | 'ai';

// Ollama Types
export interface OllamaModel {
    name: string;
    size: number;
    modified_at: string;
}

export type OllamaConnectionStatus = 'connected' | 'disconnected' | 'connecting';

// File System API Interface
export interface FileSystemAPI {
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
    readDir: (path: string) => Promise<FileNode[]>;
    isElectron: boolean;
}
