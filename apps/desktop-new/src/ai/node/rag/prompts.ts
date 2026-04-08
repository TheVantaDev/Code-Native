/**
 * prompts.ts — System Prompts for RAG-Augmented Code Assistant
 *
 * Keep prompts minimal for general queries (like Ollama default).
 * Only add instructions when project context is involved.
 */

import { QueryIntent } from './queryClassifier';

/**
 * System prompt for general coding questions - MINIMAL like Ollama default.
 */
export const GENERAL_PROMPT = `You are a helpful coding assistant. Provide clear, working code examples.`;

/**
 * System prompt for project-specific queries (with RAG context).
 */
export const PROJECT_PROMPT = `You are a coding assistant with access to the user's project code.

When code context is provided:
- Reference specific files and line numbers
- Follow the project's existing patterns
- Be specific about what to change`;

/**
 * System prompt for code modification tasks.
 */
export const CODE_ACTION_PROMPT = `You are a coding assistant that helps modify code.

Guidelines:
- Make minimal, focused changes
- Preserve existing code style
- Explain what you're changing briefly`;

/**
 * System prompt for hybrid queries (general + some project context).
 */
export const HYBRID_PROMPT = `You are a helpful coding assistant.

Some project code context may be provided. Use it if relevant, otherwise just answer the question directly.`;

/**
 * Get the appropriate system prompt based on query intent.
 */
export function getSystemPrompt(
  intent: QueryIntent,
  hasContext: boolean,
): string {
  switch (intent) {
    case 'general':
      return GENERAL_PROMPT;
    case 'project':
      return PROJECT_PROMPT;
    case 'code_action':
      return CODE_ACTION_PROMPT;
    case 'hybrid':
      return HYBRID_PROMPT;
    default:
      return GENERAL_PROMPT;
  }
}

/**
 * Format the user's message with injected context.
 */
export function formatUserMessage(
  query: string,
  context: string,
  intent: QueryIntent,
): string {
  if (!context || intent === 'general') {
    return query;
  }

  // Simple context injection
  return `${context}\n\nQuestion: ${query}`;
}

/**
 * Create a chat message array with proper system/user structure.
 */
export function buildChatMessages(
  query: string,
  context: string,
  intent: QueryIntent,
  conversationHistory: Array<{ role: string; content: string }> = [],
): Array<{ role: string; content: string }> {
  const systemPrompt = getSystemPrompt(intent, !!context);
  const userMessage = formatUserMessage(query, context, intent);

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  // Add conversation history (excluding any prior system messages)
  for (const msg of conversationHistory) {
    if (msg.role !== 'system') {
      messages.push(msg);
    }
  }

  // Add current query
  messages.push({ role: 'user', content: userMessage });

  return messages;
}
