/**
 * AI Agent Hook
 * Manages AI-driven file operations with preview and apply functionality
 */

import { useState, useCallback } from 'react';
import { useFileSystem } from './useFileSystem';
import { useEditorStore } from '../stores/editorStore';
import { useUIStore } from '../stores/uiStore';

// File operation types
export interface FileOperation {
    id: string;
    type: 'create' | 'modify' | 'delete';
    path: string;
    content?: string;
    status: 'pending' | 'applied' | 'rejected';
    originalContent?: string; // For modifications
}

// Regex to match operation blocks in AI response
// Matches: ```[operation:create] path/to/file.ts  or ```[operation:modify] path/to/file.ts
const OPERATION_REGEX = /```\[operation:(create|modify|delete)\]\s+([^\n]+)\n([\s\S]*?)```/g;

/**
 * Parse AI response for file operations
 */
export function parseFileOperations(response: string): FileOperation[] {
    const operations: FileOperation[] = [];
    let match;

    // Reset regex lastIndex
    OPERATION_REGEX.lastIndex = 0;

    while ((match = OPERATION_REGEX.exec(response)) !== null) {
        const [, type, path, content] = match;
        operations.push({
            id: crypto.randomUUID(),
            type: type as 'create' | 'modify' | 'delete',
            path: path.trim(),
            content: type !== 'delete' ? content.trim() : undefined,
            status: 'pending',
        });
    }

    return operations;
}

/**
 * Check if a message contains file operations
 */
export function hasFileOperations(response: string): boolean {
    OPERATION_REGEX.lastIndex = 0;
    return OPERATION_REGEX.test(response);
}

interface UseAIAgentReturn {
    pendingOperations: FileOperation[];
    applyOperation: (operationId: string) => Promise<boolean>;
    rejectOperation: (operationId: string) => void;
    applyAllOperations: () => Promise<void>;
    rejectAllOperations: () => void;
    processAIResponse: (response: string) => FileOperation[];
    clearOperations: () => void;
}

export function useAIAgent(): UseAIAgentReturn {
    const [pendingOperations, setPendingOperations] = useState<FileOperation[]>([]);
    const { createFile, deleteItem, isElectron } = useFileSystem();
    const { currentFolderPath } = useUIStore();
    const { openFile } = useEditorStore();

    // Process AI response and extract file operations
    const processAIResponse = useCallback((response: string): FileOperation[] => {
        const operations = parseFileOperations(response);
        if (operations.length > 0) {
            setPendingOperations(prev => [...prev, ...operations]);
        }
        return operations;
    }, []);

    // Apply a single file operation
    const applyOperation = useCallback(async (operationId: string): Promise<boolean> => {
        const operation = pendingOperations.find(op => op.id === operationId);
        if (!operation || operation.status !== 'pending') return false;

        try {
            // Build full path
            const basePath = currentFolderPath || '.';
            const fullPath = operation.path.startsWith('/') || operation.path.includes(':')
                ? operation.path
                : `${basePath}/${operation.path}`;

            switch (operation.type) {
                case 'create':
                case 'modify':
                    if (isElectron) {
                        await createFile(fullPath, operation.content || '');
                    } else {
                        // In web mode, just update editor
                        const fileName = operation.path.split('/').pop() || 'untitled';
                        const language = getLanguageFromPath(operation.path);
                        openFile({
                            id: crypto.randomUUID(),
                            name: fileName,
                            path: fullPath,
                            content: operation.content || '',
                            language,
                        });
                    }
                    break;
                case 'delete':
                    if (isElectron) {
                        await deleteItem(fullPath);
                    }
                    break;
            }

            // Mark as applied
            setPendingOperations(prev =>
                prev.map(op =>
                    op.id === operationId ? { ...op, status: 'applied' as const } : op
                )
            );
            return true;
        } catch (error) {
            console.error('Failed to apply operation:', error);
            return false;
        }
    }, [pendingOperations, currentFolderPath, isElectron, createFile, deleteItem, openFile]);

    // Reject a single operation
    const rejectOperation = useCallback((operationId: string) => {
        setPendingOperations(prev =>
            prev.map(op =>
                op.id === operationId ? { ...op, status: 'rejected' as const } : op
            )
        );
    }, []);

    // Apply all pending operations
    const applyAllOperations = useCallback(async () => {
        const pending = pendingOperations.filter(op => op.status === 'pending');
        for (const operation of pending) {
            await applyOperation(operation.id);
        }
    }, [pendingOperations, applyOperation]);

    // Reject all pending operations
    const rejectAllOperations = useCallback(() => {
        setPendingOperations(prev =>
            prev.map(op =>
                op.status === 'pending' ? { ...op, status: 'rejected' as const } : op
            )
        );
    }, []);

    // Clear all operations
    const clearOperations = useCallback(() => {
        setPendingOperations([]);
    }, []);

    return {
        pendingOperations,
        applyOperation,
        rejectOperation,
        applyAllOperations,
        rejectAllOperations,
        processAIResponse,
        clearOperations,
    };
}

// Helper to guess language from file extension
function getLanguageFromPath(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
        ts: 'typescript',
        tsx: 'typescript',
        js: 'javascript',
        jsx: 'javascript',
        py: 'python',
        java: 'java',
        cpp: 'cpp',
        c: 'c',
        cs: 'csharp',
        go: 'go',
        rs: 'rust',
        rb: 'ruby',
        php: 'php',
        html: 'html',
        css: 'css',
        scss: 'scss',
        json: 'json',
        yaml: 'yaml',
        yml: 'yaml',
        md: 'markdown',
        sql: 'sql',
        sh: 'shell',
        bash: 'shell',
    };
    return langMap[ext] || 'text';
}

export default useAIAgent;
