/**
 * promptBuilder.ts — System Prompt Builder for RAG
 *
 * Constructs the enhanced system prompt that includes:
 * 1. Project file tree overview
 * 2. Retrieved relevant code chunks (via hybrid BM25 + vector search)
 * 3. Active file content (what the user is editing)
 * 4. Instructions for AI to use [operation:...] syntax
 *
 * @author CodeNative Team
 */

import { getIndex } from './fileIndexer';
import { retrieve as bm25Retrieve, RetrievalResult } from './contextRetriever';
import { hybridRetrieve, isVectorIndexAvailable } from './vectorRetriever';

interface PromptContext {
    query: string;
    activeFile?: { path: string; content: string };
    model?: string;
}

/**
 * Retrieve relevant chunks using hybrid (BM25 + vector) search when
 * ChromaDB is available, or BM25-only otherwise.
 */
async function retrieveContext(query: string, topK: number): Promise<RetrievalResult[]> {
    if (isVectorIndexAvailable()) {
        return hybridRetrieve(query, topK);
    }
    return bm25Retrieve(query, topK, true);
}

/**
 * Build the full system prompt with RAG context
 */
export async function buildSystemPrompt(ctx: PromptContext): Promise<string> {
    const index = getIndex();
    const parts: string[] = [];

    // ═══ Core Identity ═══
    parts.push(`You are CodeNative AI — an expert coding assistant integrated into the CodeNative IDE.
You help users understand, write, and modify code in their projects.
You can read the user's project files and make changes directly in their editor.`);

    // ═══ File Tree ═══
    if (index) {
        const tree = index.fileTree;
        // Truncate if too large
        const maxTreeLines = 60;
        const treeLines = tree.split('\n');
        const truncatedTree = treeLines.length > maxTreeLines
            ? treeLines.slice(0, maxTreeLines).join('\n') + '\n... (truncated)'
            : tree;

        parts.push(`
## Project Structure
\`\`\`
${truncatedTree}
\`\`\`
Total: ${index.totalFiles} files indexed.`);
    }

    // ═══ Retrieved Context ═══
    const results = await retrieveContext(ctx.query, 8);
    if (results.length > 0) {
        parts.push(`\n## Relevant Code from Project`);

        for (const result of results) {
            const { chunk } = result;
            parts.push(`
### ${chunk.relativePath} (lines ${chunk.startLine}-${chunk.endLine})
\`\`\`${chunk.language}
${chunk.content}
\`\`\``);
        }
    }

    // ═══ Active File ═══
    if (ctx.activeFile) {
        const content = ctx.activeFile.content;
        // Truncate very long files
        const maxLines = 100;
        const lines = content.split('\n');
        const truncated = lines.length > maxLines
            ? lines.slice(0, maxLines).join('\n') + '\n// ... (file truncated)'
            : content;

        parts.push(`
## Currently Open File: ${ctx.activeFile.path}
\`\`\`
${truncated}
\`\`\``);
    }

    // ═══ File Operation Instructions ═══
    parts.push(`
## How to Edit Files

When you need to create, modify, or delete files, use this EXACT syntax in your response:

### To CREATE a new file:
\`\`\`[operation:create] path/to/newfile.ts
// file content here
\`\`\`

### To MODIFY an existing file:
\`\`\`[operation:modify] path/to/existing.ts
// complete new content of the file
\`\`\`

### To DELETE a file:
\`\`\`[operation:delete] path/to/file.ts
\`\`\`

IMPORTANT RULES:
- For MODIFY operations, include the COMPLETE file content (the entire file after your changes)
- Use relative paths from the project root
- You can include multiple file operations in one response
- ALWAYS explain what you're changing and why before the code blocks
- If the user asks to edit a file, produce [operation:modify] blocks so changes apply in real-time
- When you reference code, be specific about file paths`);

    return parts.join('\n');
}

/**
 * Build a lightweight system prompt (for non-RAG queries or when not indexed)
 */
export function buildBasicPrompt(): string {
    return `You are CodeNative AI — an expert coding assistant.
You help users write, debug, and understand code.

When you need to create, modify, or delete files, use this syntax:

To create: \`\`\`[operation:create] path/to/file.ts
To modify: \`\`\`[operation:modify] path/to/file.ts  
To delete: \`\`\`[operation:delete] path/to/file.ts

For modify operations, include the COMPLETE file content.
Always explain changes before showing code blocks.`;
}

