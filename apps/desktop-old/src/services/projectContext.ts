/**
 * projectContext.ts - AI Context Builder Service
 * 
 * This service builds the "context" that we send to the AI along with
 * the user's question. Without context, AI is just guessing. With context,
 * AI knows:
 * - What files are in your project
 * - What file you're currently editing
 * - What other files you have open
 * 
 * Think of it like this: if you asked a coworker to help with code,
 * youd show them your screen first. This is us "showing the screen" to AI.
 * 
 * Why this matters:
 * - Without context: "fix the bug" -> AI: "what bug? what code?"
 * - With context: "fix the bug" -> AI sees your code and can actually help
 * 
 * @author CodeNative Team
 * @lastUpdated Feb 2026
 */

import { FileNode } from '../types';

/**
 * Format a file tree as a compact string for AI
 * 
 * Input: Array of FileNode objects (nested tree structure)
 * Output: String like:
 *   📁 src/
 *     📁 components/
 *       📄 App.tsx
 *       📄 Button.tsx
 *     📄 index.ts
 * 
 * The indentation shows nesting. Emojis make it easy to distinguish
 * files from folders (helps the AI understand structure).
 * 
 * @param nodes - Array of file/folder nodes
 * @param indent - Current indentation (for recursion)
 */
export function formatFileTree(nodes: FileNode[], indent = ''): string {
    let result = '';

    for (const node of nodes) {
        if (node.type === 'folder') {
            // Folder - add trailing slash to make it obvious
            result += `${indent}📁 ${node.name}/\n`;

            // Recursively format children (with more indentation)
            if (node.children) {
                result += formatFileTree(node.children, indent + '  ');
            }
        } else {
            // File
            result += `${indent}📄 ${node.name}\n`;
        }
    }

    return result;
}

/**
 * Get a markdown-formatted project structure section
 * 
 * This wraps formatFileTree() output in a nice header and code block
 * that looks good when rendered
 */
export function getProjectStructure(files: FileNode[]): string {
    return `## Project Structure\n\`\`\`\n${formatFileTree(files)}\`\`\``;
}

/**
 * Build context for the currently open file
 * 
 * This is the most important context - shows AI exactly what
 * file user is looking at and what it contains.
 * 
 * We truncate to ~2000 chars to avoid blowing up the token count.
 * Most AI models have limited context windows (especially local ones
 * like llama3 which is typically 4k-8k tokens). We gotta be smart
 * about what we include.
 * 
 * @param fileName - Just the name (e.g. "App.tsx")
 * @param filePath - Full path (e.g. "/src/App.tsx")
 * @param content - The file contents
 * @param language - Programming language (e.g. "typescript")
 */
export function getCurrentFileContext(
    fileName: string,
    filePath: string,
    content: string,
    language: string
): string {
    // Limit content to avoid context overflow
    // 2000 chars is roughly 500-700 tokens depending on the content
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
 * Build a summary of all open files
 * 
 * This is lighter than full file content - just shows what tabs
 * the user has open. Helps AI understand what user is working on
 * without including all the code.
 * 
 * We mark unsaved files with "(unsaved)" so AI knows if theres
 * uncommitted changes.
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
 * BUILD THE FULL AI CONTEXT
 * 
 * This is the main function - combines all the pieces into one
 * context string that we send to the AI.
 * 
 * The order matters:
 * 1. Project structure (high level overview)
 * 2. Open files list (what user is working on)
 * 3. Current file content (the specific code)
 * 
 * This way AI gets progressively more specific info.
 * 
 * @param options - What to include in context
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

    // Add project structure if we have it
    if (options.projectStructure && options.projectStructure.length > 0) {
        parts.push(getProjectStructure(options.projectStructure));
    }

    // Add open files summary
    if (options.openFiles && options.openFiles.length > 0) {
        parts.push(getOpenFilesSummary(options.openFiles));
    }

    // Add current file content (most important!)
    if (options.currentFile) {
        parts.push(getCurrentFileContext(
            options.currentFile.name,
            options.currentFile.path,
            options.currentFile.content,
            options.currentFile.language
        ));
    }

    // Join with blank lines between sections
    return parts.join('\n\n');
}

/**
 * SYSTEM PROMPT FOR CODING ASSISTANT
 * 
 * This is sent to the AI as the "system" message - it tells the AI
 * who it is and how to behave. Think of it like the AI's job description.
 * 
 * The key part is the file operation format. We teach the AI to use
 * a special syntax when it wants to create or modify files:
 * 
 *   ```[operation:create] path/to/file.ts
 *   // file content
 *   ```
 * 
 * Our useAIAgent hook then parses this and shows Apply/Reject buttons.
 * 
 * Why this specific format?
 * - Its easy to parse with regex
 * - It looks natural in markdown
 * - User can still see the code in the chat
 * - It works even if AI adds text before/after
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

// Export everything as default for convenience
export default {
    formatFileTree,
    getProjectStructure,
    getCurrentFileContext,
    getOpenFilesSummary,
    buildAIContext,
    CODING_ASSISTANT_SYSTEM_PROMPT,
};
