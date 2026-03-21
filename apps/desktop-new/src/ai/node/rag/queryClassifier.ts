/**
 * queryClassifier.ts — Query Classification for RAG
 *
 * Determines whether a query needs project context or is general knowledge.
 * This prevents irrelevant code injection for simple questions like
 * "hello world in java" where project context isn't helpful.
 *
 * Classification categories:
 *   - general: General programming knowledge (no project context needed)
 *   - project: Queries about THIS project's code/structure
 *   - hybrid: Might benefit from both general + project context
 */

import { getIndex } from './fileIndexer';

export type QueryIntent =
  | 'general'      // General knowledge, no project context needed
  | 'project'      // Specifically about this project
  | 'hybrid'       // Could use both
  | 'code_action'; // Write/edit/refactor code in this project

export interface ClassificationResult {
  intent: QueryIntent;
  confidence: number;
  reasoning: string;
  shouldRetrieve: boolean;
  suggestedTopK: number;
}

// Keywords that suggest project-specific queries
const PROJECT_KEYWORDS = [
  'this project', 'this codebase', 'our code', 'my code',
  'the codebase', 'in this repo', 'in this project',
  'how does', 'where is', 'find the', 'show me the',
  'what does this', 'explain this', 'fix this', 'refactor this',
  'update the', 'modify the', 'change the', 'edit the',
  'in my project', 'in the project', 'existing code',
  'current implementation', 'our implementation',
];

// Keywords that suggest general knowledge queries
const GENERAL_KEYWORDS = [
  // Greetings (should never trigger project context)
  'hello', 'hi', 'hey', 'greetings', 'good morning', 'good evening',
  // General programming questions
  'hello world', 'how to', 'what is', 'explain',
  'tutorial', 'example of', 'syntax for', 'best practice',
  'difference between', 'compare', 'vs', 'versus',
  'create a new', 'write a', 'make a', 'build a',
  'simple example', 'basic', 'beginner', 'introduction',
];

// Keywords that suggest code actions in project
const ACTION_KEYWORDS = [
  'fix', 'debug', 'refactor', 'optimize', 'improve',
  'add to', 'update', 'modify', 'change', 'edit',
  'implement', 'create in', 'add feature', 'extend',
];

// File/path patterns that indicate project reference
const PATH_PATTERNS = [
  /\b[\w-]+\.(ts|tsx|js|jsx|py|java|go|rs|cpp|c|h)\b/i,
  /\bsrc\//i,
  /\bcomponents?\//i,
  /\bservices?\//i,
  /\butils?\//i,
  /\blib\//i,
  /\bapi\//i,
];

/**
 * Fast heuristic-based query classification.
 * Uses keyword matching and pattern detection - no LLM call needed.
 */
export function classifyQuery(query: string): ClassificationResult {
  const queryLower = query.toLowerCase().trim();
  const index = getIndex();

  let projectScore = 0;
  let generalScore = 0;
  let actionScore = 0;

  // Check for project-specific keywords
  for (const keyword of PROJECT_KEYWORDS) {
    if (queryLower.includes(keyword)) {
      projectScore += 2;
    }
  }

  // Check for general knowledge keywords
  for (const keyword of GENERAL_KEYWORDS) {
    if (queryLower.includes(keyword)) {
      generalScore += 2;
    }
  }

  // Check for action keywords
  for (const keyword of ACTION_KEYWORDS) {
    if (queryLower.includes(keyword)) {
      actionScore += 1.5;
    }
  }

  // Check for file/path patterns
  for (const pattern of PATH_PATTERNS) {
    if (pattern.test(query)) {
      projectScore += 3;
      break;
    }
  }

  // Check if query mentions files that exist in the project
  if (index) {
    const words = query.split(/\s+/);
    for (const word of words) {
      // Check if word matches any file path or chunk
      const matchesFile = index.chunks.some(chunk =>
        chunk.relativePath.toLowerCase().includes(word.toLowerCase()) ||
        chunk.content.toLowerCase().includes(word.toLowerCase())
      );
      if (matchesFile && word.length > 3) {
        projectScore += 1;
      }
    }
  }

  // Short queries with just language names are usually general
  const shortGeneralPatterns = [
    /^(hello world|print|log|console|echo)\s+(in\s+)?\w+$/i,
    /^(create|write|make)\s+(a\s+)?(simple\s+)?\w+\s+(in\s+|using\s+)?\w+$/i,
    /^what\s+is\s+\w+(\s+in\s+\w+)?$/i,
    /^how\s+to\s+\w+\s+in\s+\w+$/i,
  ];

  for (const pattern of shortGeneralPatterns) {
    if (pattern.test(queryLower)) {
      generalScore += 5;
    }
  }

  // Determine intent
  const totalScore = projectScore + generalScore + actionScore;
  let intent: QueryIntent;
  let confidence: number;
  let reasoning: string;

  if (actionScore > 0 && projectScore > generalScore) {
    intent = 'code_action';
    confidence = Math.min(0.9, (projectScore + actionScore) / (totalScore + 1));
    reasoning = 'Query involves modifying project code';
  } else if (projectScore > generalScore * 1.5) {
    intent = 'project';
    confidence = Math.min(0.9, projectScore / (totalScore + 1));
    reasoning = 'Query specifically references project context';
  } else if (generalScore > projectScore * 1.5) {
    intent = 'general';
    confidence = Math.min(0.9, generalScore / (totalScore + 1));
    reasoning = 'Query is about general programming knowledge';
  } else if (projectScore > 0 && generalScore > 0) {
    intent = 'hybrid';
    confidence = 0.5;
    reasoning = 'Query could benefit from both general knowledge and project context';
  } else {
    // Default: if no strong signals and query is short, assume general
    if (queryLower.split(/\s+/).length < 8) {
      intent = 'general';
      confidence = 0.6;
      reasoning = 'Short query without project-specific indicators';
    } else {
      intent = 'hybrid';
      confidence = 0.4;
      reasoning = 'Ambiguous query, will include limited project context';
    }
  }

  // Determine retrieval settings based on intent
  const shouldRetrieve = intent !== 'general';
  let suggestedTopK: number;

  switch (intent) {
    case 'code_action':
      suggestedTopK = 10; // More context for code modifications
      break;
    case 'project':
      suggestedTopK = 8;
      break;
    case 'hybrid':
      suggestedTopK = 4; // Limited context
      break;
    default:
      suggestedTopK = 0;
  }

  return {
    intent,
    confidence,
    reasoning,
    shouldRetrieve,
    suggestedTopK,
  };
}

/**
 * Extract key entities from the query for targeted retrieval.
 * Returns file names, function names, class names, etc.
 */
export function extractQueryEntities(query: string): {
  fileNames: string[];
  symbols: string[];
  concepts: string[];
} {
  const fileNames: string[] = [];
  const symbols: string[] = [];
  const concepts: string[] = [];

  // Extract file names
  const filePattern = /\b([\w-]+\.(ts|tsx|js|jsx|py|java|go|rs|cpp|c|h|css|scss|html|json|yaml|yml))\b/gi;
  let match;
  while ((match = filePattern.exec(query)) !== null) {
    fileNames.push(match[1]);
  }

  // Extract potential symbol names (camelCase, PascalCase, snake_case)
  const symbolPattern = /\b([A-Z][a-zA-Z0-9]*|[a-z]+[A-Z][a-zA-Z0-9]*|[a-z]+_[a-z_]+)\b/g;
  while ((match = symbolPattern.exec(query)) !== null) {
    const sym = match[1];
    // Filter out common words
    const commonWords = ['the', 'and', 'for', 'with', 'this', 'that', 'from', 'into'];
    if (!commonWords.includes(sym.toLowerCase()) && sym.length > 2) {
      symbols.push(sym);
    }
  }

  // Extract concepts (nouns after certain prepositions)
  const conceptPattern = /\b(about|regarding|for|of|the)\s+(\w+(?:\s+\w+)?)/gi;
  while ((match = conceptPattern.exec(query)) !== null) {
    const concept = match[2].trim();
    if (concept.length > 2) {
      concepts.push(concept);
    }
  }

  return {
    fileNames: Array.from(new Set(fileNames)),
    symbols: Array.from(new Set(symbols)),
    concepts: Array.from(new Set(concepts)),
  };
}
