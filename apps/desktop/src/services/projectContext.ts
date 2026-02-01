/**
 * Project Context Service
 * Builds context about the current project for the AI assistant
 */

import { FileNode } from '../types';

/**
 * Format file tree as a compact string for AI context
 */
export function formatFileTree(nodes: FileNode[], indent = ''): string {
    let result = '';
    for (const node of nodes) {
        if (node.type === 'folder') {
            result += `${indent}📁 ${node.name}/\n`;
            if (node.children) {
                result += formatFileTree(node.children, indent + '  ');
            }
        } else {
            result += `${indent}📄 ${node.name}\n`;
        }
    }
    return result;
}

/**
 * Get a compact project structure string
 */
export function getProjectStructure(files: FileNode[]): string {
    return `## Project Structure\n\`\`\`\n${formatFileTree(files)}\`\`\``;
}

/**
 * Build context for the currently open file
 */
export function getCurrentFileContext(
    fileName: string,
    filePath: string,
    content: string,
    language: string
): string {
    // Limit content to avoid context overflow (roughly 2000 chars)
    const maxLength = 2000;
    const truncatedContent = content.length > maxLength
        ? content.substring(0, maxLength) + '\n...[truncated]'
        : content;

    return `## Currently Open File
**File:** ${fileName}
**Path:** ${filePath}
**Language:** ${language}

\`\`\`${language}
${truncatedContent}
\`\`\``;
}

/**
 * Build context for all open files (summary only)
 */
export function getOpenFilesSummary(
    files: Array<{ name: string; path: string; language: string; isDirty: boolean }>
): string {
    if (files.length === 0) return '';

    const fileList = files
        .map(f => `- ${f.name}${f.isDirty ? ' (unsaved)' : ''} - ${f.language}`)
        .join('\n');

    return `## Open Files\n${fileList}`;
}

/**
 * Build the full context for the AI
 */
export function buildAIContext(options: {
    projectStructure?: FileNode[];
    currentFile?: {
        name: string;
        path: string;
        content: string;
        language: string;
    };
    openFiles?: Array<{ name: string; path: string; language: string; isDirty: boolean }>;
}): string {
    const parts: string[] = [];

    if (options.projectStructure && options.projectStructure.length > 0) {
        parts.push(getProjectStructure(options.projectStructure));
    }

    if (options.openFiles && options.openFiles.length > 0) {
        parts.push(getOpenFilesSummary(options.openFiles));
    }

    if (options.currentFile) {
        parts.push(getCurrentFileContext(
            options.currentFile.name,
            options.currentFile.path,
            options.currentFile.content,
            options.currentFile.language
        ));
    }

    return parts.join('\n\n');
}

/**
 * System prompt for the AI coding assistant
 */
export const CODING_ASSISTANT_SYSTEM_PROMPT = `You are an expert AI coding assistant integrated into an IDE. You help developers write, edit, and understand code.

## Capabilities
- Answer coding questions and explain code
- Generate new code files  
- Modify existing files
- Debug issues and suggest fixes

## File Operations
When the user asks you to create or modify files, use this exact format:

### To CREATE a new file:
\`\`\`[operation:create] path/to/newfile.ts
// file content here
\`\`\`

### To MODIFY an existing file:
\`\`\`[operation:modify] path/to/existing.ts
// complete new file content
\`\`\`

## Guidelines
- Be concise and precise
- When modifying files, always provide the complete updated content
- Explain what changes you're making and why
- If you need more context, ask the user
- Use the file path relative to the project root`;

export default {
    formatFileTree,
    getProjectStructure,
    getCurrentFileContext,
    getOpenFilesSummary,
    buildAIContext,
    CODING_ASSISTANT_SYSTEM_PROMPT,
};
