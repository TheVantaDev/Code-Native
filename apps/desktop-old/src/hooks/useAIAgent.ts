/**
 * useAIAgent.ts - Agentic File Operations Hook
 * 
 * This is the "magic" that makes our AI actually do things, not just talk.
 * When the AI responds with special syntax like:
 * 
 *   ```[operation:create] src/utils.ts
 *   export function add(a, b) { return a + b; }
 *   ```
 * 
 * This hook parses that and gives user the ability to apply it with 1 click.
 * 
 * Why we built this:
 * - Users dont want to copy-paste code manually
 * - AI can generate entire files but we need to save them somehow
 * - We want user to review changes before applying (safety!)
 * 
 * The flow is:
 * 1. AI responds with [operation:create] or [operation:modify] blocks
 * 2. processAIResponse() parses these using regex
 * 3. UI shows FileOperationCard with Apply/Reject buttons
 * 4. User clicks Apply -> we create/modify the actual file
 * 
 * @author CodeNative Team
 * @lastUpdated Feb 2026
 */

import { useState, useCallback } from 'react';
import { useFileSystem } from './useFileSystem';
import { useEditorStore } from '../stores/editorStore';
import { useUIStore } from '../stores/uiStore';

/**
 * Represents a single file operation proposed by AI
 * 
 * Example: AI says "create src/hello.ts with this content"
 * becomes FileOperation with type='create', path='src/hello.ts', content='...'
 */
export interface FileOperation {
    id: string;                              // Unique ID for React keys
    type: 'create' | 'modify' | 'delete';    // What kind of operation
    path: string;                            // File path (relative to project)
    content?: string;                        // File content (not for delete)
    status: 'pending' | 'applied' | 'rejected';  // Has user dealt with it?
    originalContent?: string;                // For modify - whats there now
}

/**
 * THE REGEX - this is what extracts operations from AI responses
 * 
 * It matches this pattern:
 *   ```[operation:TYPE] path/to/file.ts
 *   content here
 *   ```
 * 
 * Breakdown:
 * - ``` - opening code fence
 * - \[operation:(create|modify|delete)\] - the operation tag
 * - \s+([^\n]+) - the file path (everything until newline)
 * - \n([\s\S]*?) - the content (lazy match everything)
 * - ``` - closing code fence
 * 
 * The /g flag means we find ALL matches, not just the first
 */
const OPERATION_REGEX = /```\[operation:(create|modify|delete)\]\s+([^\n]+)\n([\s\S]*?)```/g;

/**
 * Parse AI response text and extract file operations
 * 
 * @param response - The AI's response text
 * @returns Array of FileOperation objects
 */
export function parseFileOperations(response: string): FileOperation[] {
    const operations: FileOperation[] = [];
    let match;

    // Reset regex state (important! regex with /g flag is stateful)
    OPERATION_REGEX.lastIndex = 0;

    // Keep finding matches until there are none left
    while ((match = OPERATION_REGEX.exec(response)) !== null) {
        const [, type, path, content] = match;

        operations.push({
            id: crypto.randomUUID(),  // Generate unique ID
            type: type as 'create' | 'modify' | 'delete',
            path: path.trim(),
            content: type !== 'delete' ? content.trim() : undefined,
            status: 'pending',
        });
    }

    return operations;
}

/**
 * Quick check if a response contains any file operations
 * Faster than parsing - just tests the regex
 */
export function hasFileOperations(response: string): boolean {
    OPERATION_REGEX.lastIndex = 0;  // Reset!
    return OPERATION_REGEX.test(response);
}

/**
 * Return type for useAIAgent hook
 */
interface UseAIAgentReturn {
    pendingOperations: FileOperation[];          // All ops (pending, applied, rejected)
    applyOperation: (operationId: string) => Promise<boolean>;  // Apply single op
    rejectOperation: (operationId: string) => void;             // Reject single op
    applyAllOperations: () => Promise<void>;     // Apply all pending
    rejectAllOperations: () => void;             // Reject all pending
    processAIResponse: (response: string) => FileOperation[];   // Parse new response
    clearOperations: () => void;                 // Clear everything
}

/**
 * THE HOOK - manages file operations from AI
 * 
 * Use this in any component that needs to handle AI-proposed changes.
 * Right now thats mainly AIPanel.tsx
 */
export function useAIAgent(): UseAIAgentReturn {
    // All operations - pending, applied, and rejected
    // We keep rejected ones too so user can see what they declined
    const [pendingOperations, setPendingOperations] = useState<FileOperation[]>([]);

    // Get file system functions from our useFileSystem hook
    // isElectron tells us if were in the desktop app or web browser
    const { createFile, deleteItem, isElectron } = useFileSystem();

    // Current project folder - needed to build full file paths
    const { currentFolderPath } = useUIStore();

    // For opening newly created files in the editor
    const { openFile } = useEditorStore();

    /**
     * Process AI response and extract file operations
     * Called automatically when we get a new AI message in AIPanel
     * 
     * @param response - The AI response text
     * @returns The new operations found (also added to state)
     */
    const processAIResponse = useCallback((response: string): FileOperation[] => {
        const operations = parseFileOperations(response);

        if (operations.length > 0) {
            // Add new ops to existing list (dont replace!)
            setPendingOperations(prev => [...prev, ...operations]);
        }

        return operations;
    }, []);

    /**
     * Apply a single file operation
     * 
     * This actually creates/modifies/deletes the file!
     * 
     * @param operationId - Which operation to apply
     * @returns true if successful, false if failed
     */
    const applyOperation = useCallback(async (operationId: string): Promise<boolean> => {
        // Find the operation
        const operation = pendingOperations.find(op => op.id === operationId);
        if (!operation || operation.status !== 'pending') return false;

        try {
            // Build the full path
            // If path is relative (like "src/utils.ts"), prepend project folder
            // If path is absolute (like "C:\..."), use as-is
            const basePath = currentFolderPath || '.';
            const fullPath = operation.path.startsWith('/') || operation.path.includes(':')
                ? operation.path
                : `${basePath}/${operation.path}`;

            // Do the actual operation!
            switch (operation.type) {
                case 'create':
                case 'modify':
                    if (isElectron) {
                        // In Electron, actually write to disk
                        await createFile(fullPath, operation.content || '');
                    } else {
                        // In web mode, just open in editor (cant write to real fs)
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
                    // In web mode, we cant really delete files
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

    /**
     * Reject a single operation
     * Just marks it as rejected - doesnt delete anything
     */
    const rejectOperation = useCallback((operationId: string) => {
        setPendingOperations(prev =>
            prev.map(op =>
                op.id === operationId ? { ...op, status: 'rejected' as const } : op
            )
        );
    }, []);

    /**
     * Apply ALL pending operations
     * Useful when AI proposes multiple files and user trusts it
     */
    const applyAllOperations = useCallback(async () => {
        const pending = pendingOperations.filter(op => op.status === 'pending');

        // Apply one by one (not in parallel to avoid race conditions)
        for (const operation of pending) {
            await applyOperation(operation.id);
        }
    }, [pendingOperations, applyOperation]);

    /**
     * Reject all pending operations
     * Quick way to dismiss everything
     */
    const rejectAllOperations = useCallback(() => {
        setPendingOperations(prev =>
            prev.map(op =>
                op.status === 'pending' ? { ...op, status: 'rejected' as const } : op
            )
        );
    }, []);

    /**
     * Clear all operations (pending, applied, rejected)
     * Called when user clears chat history
     */
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

/**
 * Helper: Guess programming language from file extension
 * Used for syntax highlighting in the editor
 * 
 * @param path - File path like "src/utils.ts"
 * @returns Language string like "typescript"
 */
function getLanguageFromPath(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() || '';

    // Map of extension -> language
    // Add more as needed!
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
