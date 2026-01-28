// ================================
// Shared Types for CodeNative IDE
// ================================

// AI Chat Types
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
}

export interface ChatRequest {
    message: string;
    model?: string;
    context?: string;
    conversationId?: string;
}

export interface ChatResponse {
    id: string;
    content: string;
    model: string;
    done: boolean;
}

// Code Execution Types
export type SupportedLanguage = 'javascript' | 'python' | 'java' | 'typescript';

export interface ExecuteRequest {
    code: string;
    language: SupportedLanguage;
    timeout?: number;
}

export interface ExecuteResponse {
    stdout: string;
    stderr: string;
    exitCode: number;
    executionTime: number;
    error?: string;
}

// File System Types
export interface FileNode {
    id: string;
    name: string;
    path: string;
    type: 'file' | 'folder';
    children?: FileNode[];
    language?: string;
}

export interface OpenFile {
    id: string;
    name: string;
    path: string;
    content: string;
    language: string;
    isDirty: boolean;
}

// Collaboration Types
export interface CollabUser {
    id: string;
    name: string;
    color: string;
    cursor?: {
        line: number;
        column: number;
    };
}

export interface CollabRoom {
    id: string;
    fileId: string;
    users: CollabUser[];
}

export interface CollabChange {
    userId: string;
    fileId: string;
    changes: {
        range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
        text: string;
    }[];
    timestamp: number;
}

// Ollama Types
export interface OllamaModel {
    name: string;
    size: number;
    modified_at: string;
}

export type OllamaConnectionStatus = 'connected' | 'disconnected' | 'connecting';

// API Response Types
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

// WebSocket Events
export const WS_EVENTS = {
    // Collaboration
    JOIN_ROOM: 'collab:join',
    LEAVE_ROOM: 'collab:leave',
    USER_JOINED: 'collab:user_joined',
    USER_LEFT: 'collab:user_left',
    CURSOR_MOVE: 'collab:cursor_move',
    CODE_CHANGE: 'collab:code_change',
    SYNC_REQUEST: 'collab:sync_request',
    SYNC_RESPONSE: 'collab:sync_response',

    // Terminal
    TERMINAL_INPUT: 'terminal:input',
    TERMINAL_OUTPUT: 'terminal:output',
    TERMINAL_RESIZE: 'terminal:resize',
} as const;
