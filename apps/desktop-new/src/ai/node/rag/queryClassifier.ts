/**
 * queryClassifier.ts — Query Classification for RAG
 *
 * Determines whether a query needs project context or is general knowledge.
 * This prevents irrelevant code injection for simple questions like
 * "hello world in java" where project context isn't helpful.
 *
 * Classification categories:
 *   - general:     General programming knowledge (no project context needed)
 *   - project:     Queries about THIS project's code/structure
 *   - hybrid:      Might benefit from both general + project context
 *   - code_action: Write/edit/refactor/run code in this project
 *
 * Keywords sourced from: Aider, Cline, Continue.dev intent patterns
 * Last upgraded: v3 — full coverage
 */

import { getIndex } from './fileIndexer';

export type QueryIntent =
  | 'general'      // General knowledge, no project context needed
  | 'project'      // Specifically about this project
  | 'hybrid'       // Could use both
  | 'code_action'; // Write/edit/refactor/run/fix code in this project

export interface ClassificationResult {
  intent: QueryIntent;
  confidence: number;
  reasoning: string;
  shouldRetrieve: boolean;
  suggestedTopK: number;
}

// ══════════════════════════════════════════════════════════════════════
// PROJECT_KEYWORDS
// Signals user is asking about THEIR specific codebase
// ══════════════════════════════════════════════════════════════════════
const PROJECT_KEYWORDS = [
  'this project', 'this codebase', 'our code', 'my code',
  'the codebase', 'in this repo', 'in this project',
  'how does', 'where is', 'find the', 'show me the',
  'what does this', 'explain this', 'fix this', 'refactor this',
  'update the', 'modify the', 'change the', 'edit the',
  'in my project', 'in the project', 'existing code',
  'current implementation', 'our implementation',
  'my implementation', 'look at my', 'look at the',
  'check my', 'check the', 'review my', 'review the',
  'analyze my', 'analyze the', 'analyse my', 'analyse the',
  'what does my', 'how is my', 'why is my',
  'this function', 'this class', 'this module', 'this component',
  'this file', 'this code', 'this method',
];

// ══════════════════════════════════════════════════════════════════════
// GENERAL_KEYWORDS
// Signals pure knowledge questions — never trigger project context
// ══════════════════════════════════════════════════════════════════════
const GENERAL_KEYWORDS = [
  // Greetings
  'hello', 'hi', 'hey', 'greetings', 'good morning', 'good evening', 'good afternoon',

  // Pure knowledge
  'hello world', 'how to', 'what is', 'what are', 'explain',
  'tutorial', 'example of', 'example in', 'snippet of',
  'syntax for', 'best practice', 'best practices',
  'difference between', 'compare', 'vs', 'versus',
  'simple example', 'basic example', 'basic', 'beginner', 'introduction',
  'give me code', 'show me code', 'code for',
  'when to use', 'why use', 'pros and cons', 'advantages of',
  'disadvantages of', 'how does x work', 'what does x mean',

  // Learning / docs intent
  'how do i', 'how do you', 'can you explain', 'can you tell me',
  'what is the difference', 'which is better', 'should i use',
];

// ══════════════════════════════════════════════════════════════════════
// ACTION_KEYWORDS — v3 (Aider + Cline + original)
// Signals user wants to CREATE, EDIT, RUN, TEST, DELETE files/code
// ══════════════════════════════════════════════════════════════════════
const ACTION_KEYWORDS = [

  // ── FILE CREATION ─────────────────────────────────────────────────
  'create a file', 'create file', 'make a file', 'make file',
  'write a file', 'write file', 'write to file', 'save file',
  'new file', 'add file', 'generate file', 'produce file',
  'create a new file', 'make a new file', 'give me a file',
  'i need a file', 'can you create a file', 'please create a file',
  'touch a file', 'touch file',

  // ── FILE EDITING ──────────────────────────────────────────────────
  'edit file', 'edit the file', 'modify file', 'update file', 'change file',
  'fix the file', 'fix file', 'fix this file', 'patch the file',
  'append to file', 'prepend to file', 'insert into file',
  'overwrite file', 'rewrite file', 'rewrite the file',
  'add to the file', 'update the file', 'change the file',

  // ── DIRECTORY / FOLDER OPERATIONS ────────────────────────────────
  'create a folder', 'make a folder', 'create folder', 'make folder',
  'new folder', 'add folder', 'create directory', 'make directory',
  'mkdir', 'new directory', 'create a directory', 'make a directory',
  'in this folder', 'in this directory', 'in the folder', 'in the directory',
  'this folder', 'current folder', 'selected folder', 'current directory',

  // ── PROJECT / APP SCAFFOLDING ─────────────────────────────────────
  'create a project', 'make a project', 'build a project', 'new project',
  'create an app', 'make an app', 'build an app', 'create a website',
  'make a website', 'scaffold', 'create a todo', 'make a todo',
  'create a calculator', 'make a calculator',
  'create a game', 'make a game',
  'create a rest api', 'make a rest api', 'create a graphql api',
  'create a cli', 'make a cli tool', 'create a cli tool',
  'create a bot', 'make a bot', 'create a discord bot',
  'create a microservice', 'create a monorepo', 'create a library',
  'spin up', 'bootstrap', 'initialize a project', 'init a project',
  'set up a project', 'set up an app', 'set up the project',
  'start a new project', 'start a new app', 'start from scratch',
  'build from scratch', 'build me a', 'make me a',
  'generate a project', 'generate an app', 'generate a component',
  'write me a', 'code me a', 'write me the',
  'from scratch', 'from zero', 'from an empty folder',
  'empty folder', 'empty directory',

  // ── TECH STACK SPECIFIC ───────────────────────────────────────────
  'create a react', 'create a next', 'create a vue', 'create a svelte',
  'create a node', 'create a express', 'create a fastapi', 'create a flask',
  'create a django', 'create a spring', 'create a nest', 'create a vite',
  'create a electron', 'create a tauri', 'add a component', 'new component',
  'create a hook', 'create a context', 'create a provider',
  'create a page', 'create a route', 'create a layout',
  'create a service', 'create a controller', 'create a middleware',
  'create a utility', 'create a helper', 'create a module',
  'create a class', 'create a interface', 'create a type',

  // ── DEPENDENCY MANAGEMENT ─────────────────────────────────────────
  'install', 'npm install', 'yarn add', 'pnpm add', 'pip install',
  'add dependency', 'add package', 'add a package', 'install package',
  'add to package.json', 'update package.json', 'add to requirements',
  'cargo add', 'go get', 'gem install', 'brew install',

  // ── CODE GENERATION ───────────────────────────────────────────────
  'fix', 'debug', 'refactor', 'optimize', 'improve',
  'add to', 'update', 'modify', 'change', 'edit',
  'implement', 'create in', 'add feature', 'extend',
  'delete', 'remove', 'rename', 'move',
  'add function', 'add method', 'add class', 'add interface',
  'add endpoint', 'add route', 'add api', 'add handler',
  'write function', 'write class', 'write method',
  'generate function', 'generate class', 'generate code',

  // ── AIDER-SOURCED INTENTS (/run, /test, /lint, /fix, /architect) ──
  'run the tests', 'run tests', 'run my tests', 'run the test',
  'execute tests', 'execute the tests',
  'lint the code', 'lint my code', 'lint this', 'run lint',
  'run linter', 'check lint', 'fix lint errors', 'fix linting',
  'run the app', 'run my app', 'execute the app', 'start the app',
  'run the server', 'start the server', 'start server',
  'run the script', 'execute the script', 'run this script',
  'run npm', 'run yarn', 'run pnpm', 'run python',
  'run build', 'npm run build', 'yarn build', 'build the app',
  'compile the code', 'compile this', 'build this',
  'undo the last change', 'undo last commit', 'revert the change',
  'show diff', 'show the diff', 'what changed', 'what did you change',
  'commit this', 'commit the changes', 'git commit',
  'go ahead', 'proceed', 'do it', 'apply it', 'apply the changes',
  'architect', 'plan the project', 'plan this out', 'think through',
  'add to chat', 'drop from chat', 'clear context',

  // ── TESTING ───────────────────────────────────────────────────────
  'write tests', 'add tests', 'create tests', 'generate tests',
  'write unit tests', 'add unit test', 'create unit test',
  'write test for', 'add test for', 'write spec', 'add spec',
  'create a test file', 'make a test file',
  'write integration tests', 'write e2e tests', 'write end to end',
  'write snapshot test', 'add coverage', 'improve coverage',
  'mock this', 'stub this', 'add mock', 'add stub',

  // ── CONFIG / ENV / INFRA FILES ────────────────────────────────────
  'add config', 'create config', 'setup config', 'generate config',
  'create .env', 'add .env', 'setup environment variables',
  'add environment variable', 'add env var', 'add env variable',
  'add .gitignore', 'create .gitignore', 'add gitignore',
  'add dockerfile', 'create dockerfile', 'add docker', 'setup docker',
  'add docker-compose', 'create docker-compose',
  'add ci', 'add github actions', 'create github actions',
  'add eslint', 'add prettier', 'add tsconfig', 'create tsconfig',
  'add webpack', 'add vite config', 'add jest config',
  'add tailwind', 'setup tailwind', 'configure tailwind',
  'add husky', 'add lint-staged', 'add commitlint',
  'add editorconfig', 'add nvmrc',

  // ── DATABASE / SCHEMA ─────────────────────────────────────────────
  'add migration', 'create migration', 'setup database',
  'add schema', 'create schema', 'add model', 'create model',
  'create a table', 'add a table', 'design schema',
  'add prisma', 'setup prisma', 'init prisma',
  'add drizzle', 'add typeorm', 'add mongoose',
  'add seed', 'create seed', 'add seeder',

  // ── README / DOCS ─────────────────────────────────────────────────
  'add readme', 'create readme', 'write readme',
  'add documentation', 'write docs', 'generate docs',
  'add comments', 'document this', 'document the',
  'add jsdoc', 'add tsdoc', 'add docstring',
  'add changelog', 'update changelog', 'write changelog',

  // ── CLEANUP / DELETION ────────────────────────────────────────────
  'delete all', 'remove all', 'delete the file', 'remove the file',
  'delete files', 'remove files', 'clean up', 'cleanup',
  'keep only', 'delete everything', 'remove everything',
  'erase', 'wipe', 'clear the folder',
  'remove unused', 'remove dead code', 'clean dead code',
  'remove imports', 'clean imports', 'organize imports',

  // ── GIT OPERATIONS ────────────────────────────────────────────────
  'initialize git', 'init git', 'git init', 'add gitignore',
  'create a branch', 'make a branch', 'add a remote',
  'stage all', 'unstage', 'reset changes',
];

// ══════════════════════════════════════════════════════════════════════
// FILE_ACTION_PATTERNS — v3
// Regex patterns: stronger signals for file operations
// These always win over scoring and immediately return code_action
// ══════════════════════════════════════════════════════════════════════
const FILE_ACTION_PATTERNS: RegExp[] = [

  // ── Direct file operations ────────────────────────────────────────
  /\bcreate\s+(a\s+)?(new\s+)?file\b/i,
  /\bmake\s+(a\s+)?(new\s+)?file\b/i,
  /\bwrite\s+(a\s+)?(new\s+)?file\b/i,
  /\bgive\s+me\s+(a\s+)?(new\s+)?file\b/i,
  /\bi\s+need\s+(a\s+)?(new\s+)?file\b/i,
  /\bgenerate\s+(a\s+)?(new\s+)?file\b/i,
  /\bsave\s+(this\s+)?as\b/i,
  /\bedit\s+(the\s+)?file\b/i,
  /\bmodify\s+(the\s+)?file\b/i,
  /\bupdate\s+(the\s+)?file\b/i,
  /\bfix\s+(the\s+)?file\b/i,
  /\brewrite\s+(the\s+)?file\b/i,
  /\bappend\s+(to\s+)?(the\s+)?file\b/i,
  /\boverwrite\s+(the\s+)?file\b/i,

  // ── File named with extension ─────────────────────────────────────
  /\b(create|make|write|generate|add|produce|give\s+me)\s+(a\s+)?[\w-]+\.(ts|tsx|js|jsx|mjs|cjs|py|java|go|rs|cpp|c|h|txt|json|yaml|yml|html|css|scss|sass|less|md|sh|bash|zsh|env|sql|graphql|prisma|toml|xml|php|rb|swift|kt|dart|r|m|ex|exs)\b/i,

  // ── Folder / directory creation ───────────────────────────────────
  /\b(create|make|add|mkdir)\s+(a\s+)?(new\s+)?(folder|directory|dir)\b/i,

  // ── Project / app scaffolding ─────────────────────────────────────
  /\b(make|build|create|scaffold|generate|setup|initialize|init|spin\s*up|bootstrap|start)\s+(a\s+)?(new\s+)?(project|app|application|website|web\s*app|game|api|rest\s*api|graphql\s*api|server|cli|tool|library|lib|component|module|calculator|todo|chat|blog|dashboard|microservice|monorepo|boilerplate|template|starter|repo|repository)\b/i,

  // ── Tech stack shortcuts ──────────────────────────────────────────
  /\b(create|make|build|generate|set\s*up|scaffold)\s+(a\s+)?(react|next\.?js|nextjs|vue|svelte|angular|express|fastapi|flask|django|node|nestjs|vite|electron|tauri|astro|remix|nuxt|sveltekit|hono|bun|deno)\s*(app|project|api|server|component|page|route|app)?\b/i,

  // ── "Give me / Write me / Build me" ──────────────────────────────
  /\b(give\s+me|write\s+me|build\s+me|make\s+me|code\s+me|create\s+me)\s+(a\s+)?(working|simple|basic|full|complete|minimal)?\s*(app|project|api|server|component|file|script|function|class|module|service|controller|hook|context|provider|page|layout|route)\b/i,

  // ── Infra/config file creation ────────────────────────────────────
  /\b(add|create|generate|setup|write)\s+(a\s+)?(dockerfile|docker-compose|\.env|\.env\.local|\.env\.example|gitignore|\.gitignore|eslintrc|\.eslintrc|prettierrc|\.prettierrc|tsconfig|jest\.config|vite\.config|webpack\.config|tailwind\.config|next\.config|nuxt\.config|svelte\.config|github\s+actions?|ci\/cd|\.nvmrc|\.editorconfig|husky|lint-staged|commitlint)\b/i,

  // ── Test file creation ────────────────────────────────────────────
  /\b(write|add|create|generate)\s+(a\s+)?(unit\s+|integration\s+|e2e\s+|end-to-end\s+|snapshot\s+)?tests?\s*(for|file|spec|suite)?\b/i,
  /\b(write|add|create|generate)\s+(a\s+)?spec\s+(file\s+)?for\b/i,

  // ── In folder/directory context ───────────────────────────────────
  /\bin\s+(this|the|current|selected|that)\s+(folder|directory|dir|path|workspace)\b/i,

  // ── Aider-style run/lint/test commands ───────────────────────────
  /\brun\s+(the\s+)?(tests?|linter?|build|server|app|script|command)\b/i,
  /\blint\s+(this|the|my)?\s*(code|file|project|codebase)?\b/i,
  /\bfix\s+(the\s+)?(lint|linting|errors?|bugs?|issues?|warnings?|types?)\b/i,
  /\bgo\s+ahead\b/i,
  /\bdo\s+it\b/i,
  /\bapply\s+(it|the\s+changes?|this)\b/i,
  /\bproceed\b/i,

  // ── Scaffold / bootstrap shorthands ──────────────────────────────
  /\bscaffold\b/i,
  /\bbootstrap\s+(a|the|this)?\s*(project|app|application|codebase)\b/i,
  /\bset\s*up\s+(a|the|this)?\s*(project|app|application|server|api)\b/i,
  /\bstart\s+(a|the|this)?\s*(new\s+)?(project|app|application)\b/i,
  /\bspin\s+up\s+(a|the|this|an?)?\s*(project|app|application|server|api|service)\b/i,
  /\binit(ialize)?\s+(a\s+)?(new\s+)?(project|repo|repository|app|codebase)\b/i,
  /\bfrom\s+(scratch|zero|nothing|an?\s+empty\s+folder|an?\s+empty\s+directory)\b/i,

  // ── Database / schema ─────────────────────────────────────────────
  /\b(add|create|write|generate)\s+(a\s+)?(migration|schema|model|seed|seeder|table|entity)\b/i,
  /\b(setup|init|add|configure)\s+(prisma|drizzle|typeorm|mongoose|sequelize|knex)\b/i,

  // ── README / docs ─────────────────────────────────────────────────
  /\b(add|create|write|generate)\s+(a\s+)?(readme|documentation|docs|\.md|jsdoc|tsdoc|docstring|changelog)\b/i,

  // ── Delete / cleanup ──────────────────────────────────────────────
  /\b(delete|remove|erase|wipe|clear)\s+(all|every(thing)?|the\s+)?(files?|folders?|contents?|code|imports?)?\b/i,
  /\bclean\s+(up\s+)?(dead\s+code|unused|imports?|dependencies)\b/i,

  // ── Git operations ────────────────────────────────────────────────
  /\b(init(ialize)?|setup|create)\s+(a\s+)?(git\s+repo(sitory)?|gitignore|\.gitignore)\b/i,
  /\bcommit\s+(this|these|the|all|my)\s+(changes?|files?)?\b/i,

  // ── Dependency management ─────────────────────────────────────────
  /\b(npm|yarn|pnpm|pip|cargo|go|gem|brew)\s+(install|add|remove|uninstall|update|upgrade)\b/i,
  /\binstall\s+(the\s+)?(dependencies|packages?|modules?|libs?|libraries?)\b/i,
  /\badd\s+(a\s+)?(dependency|package|module|library|lib)\b/i,
];

// ══════════════════════════════════════════════════════════════════════
// PATH_PATTERNS
// File/path references that suggest project context
// ══════════════════════════════════════════════════════════════════════
const PATH_PATTERNS: RegExp[] = [
  /\b[\w-]+\.(ts|tsx|js|jsx|mjs|cjs|py|java|go|rs|cpp|c|h|css|scss|html|json|yaml|yml|prisma|sql|graphql|md)\b/i,
  /\bsrc\//i,
  /\bcomponents?\//i,
  /\bservices?\//i,
  /\butils?\//i,
  /\blib\//i,
  /\bapi\//i,
  /\bpages?\//i,
  /\broutes?\//i,
  /\bmodels?\//i,
  /\bcontrollers?\//i,
  /\btypes?\//i,
  /\bhooks?\//i,
  /\bstores?\//i,
  /\bconfig\//i,
  /\btest(s)?\//i,
  /\bspec(s)?\//i,
  /\bdist\//i,
  /\bbuild\//i,
];

// ══════════════════════════════════════════════════════════════════════
// CONVERSATIONAL_PATTERNS
// Social messages — ALWAYS return general, NEVER trigger tools
// ══════════════════════════════════════════════════════════════════════
const CONVERSATIONAL_PATTERNS: RegExp[] = [
  /^(thank(s| you)|ty|thx|thankyou)(\s|!|\.|,|$)/i,
  /^(great|cool|nice|awesome|perfect|amazing|excellent|good job|well done|brilliant|fantastic|wonderful|superb)(\s|!|\.|$)/i,
  /^(ok(ay)?|alright|sure|sounds good|got it|understood|makes sense|i see|i got it)(\s|!|\.|$)/i,
  /^(hello|hi|hey|howdy|good (morning|evening|afternoon|night))(\s|!|\.|$)/i,
  /^(yes|no|nope|yep|yeah|nah|aye|not really)(\s|!|\.|$)/i,
  /^(done|finished|stop|cancel|nevermind|never mind|abort|quit|exit)(\s|!|\.|$)/i,
  /^lgtm/i,
  /^(wow|whoa|oh|ah|hmm|hm|ugh|yikes|oops)(\s|!|\.|$)/i,
  /^(continue|keep going|go on|next|proceed|more|keep it up)(\s|!|\.|$)/i,
  /^(not bad|not great|could be better|works for me|that works)(\s|!|\.|$)/i,
];

/**
 * Fast heuristic-based query classification.
 * Uses keyword matching and pattern detection — no LLM call needed.
 */
export function classifyQuery(query: string): ClassificationResult {
  const queryLower = query.toLowerCase().trim();
  const index = getIndex();

  // ── GUARD 0: Conversational messages → always general ─────────────
  for (const pattern of CONVERSATIONAL_PATTERNS) {
    if (pattern.test(queryLower)) {
      return {
        intent: 'general',
        confidence: 1.0,
        reasoning: 'Conversational message — no tool use needed',
        shouldRetrieve: false,
        suggestedTopK: 0,
      };
    }
  }

  // ── PRIORITY: File operation patterns → immediate code_action ─────
  for (const pattern of FILE_ACTION_PATTERNS) {
    if (pattern.test(query)) {
      return {
        intent: 'code_action',
        confidence: 0.95,
        reasoning: 'Query explicitly requests file or project operation',
        shouldRetrieve: true,
        suggestedTopK: 10,
      };
    }
  }

  // ── SCORING ───────────────────────────────────────────────────────
  let projectScore = 0;
  let generalScore = 0;
  let actionScore = 0;

  for (const keyword of PROJECT_KEYWORDS) {
    if (queryLower.includes(keyword)) projectScore += 2;
  }

  for (const keyword of GENERAL_KEYWORDS) {
    if (queryLower.includes(keyword)) generalScore += 2;
  }

  for (const keyword of ACTION_KEYWORDS) {
    if (queryLower.includes(keyword)) actionScore += 3;
  }

  for (const pattern of PATH_PATTERNS) {
    if (pattern.test(query)) {
      projectScore += 3;
      break;
    }
  }

  // Boost project score if query mentions files in the actual index
  if (index) {
    const words = query.split(/\s+/);
    for (const word of words) {
      if (word.length <= 3) continue;
      const matchesFile = index.chunks.some(
        (chunk) =>
          chunk.relativePath.toLowerCase().includes(word.toLowerCase()) ||
          chunk.content.toLowerCase().includes(word.toLowerCase())
      );
      if (matchesFile) projectScore += 1;
    }
  }

  // Short general patterns get a big boost to prevent false positives
  const shortGeneralPatterns: RegExp[] = [
    /^(hello world|print|log|console|echo)\s+(in\s+)?\w+$/i,
    /^what\s+is\s+\w+(\s+in\s+\w+)?$/i,
    /^how\s+to\s+\w+\s+in\s+\w+$/i,
    /^(explain|define|what\s+is)\s+\w+(\s+\w+)?$/i,
  ];

  for (const pattern of shortGeneralPatterns) {
    if (pattern.test(queryLower)) generalScore += 5;
  }

  // ── DETERMINE INTENT ──────────────────────────────────────────────
  const totalScore = projectScore + generalScore + actionScore;
  let intent: QueryIntent;
  let confidence: number;
  let reasoning: string;

  // Require actionScore >= 3 to avoid single weak keyword ("update", "fix")
  // triggering code_action on general queries like "what does fix mean"
  if (actionScore >= 3 && actionScore >= generalScore) {
    intent = 'code_action';
    confidence = Math.min(0.92, (projectScore + actionScore) / (totalScore + 1));
    reasoning = 'Query involves modifying or running project code';
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
    // Default: short query → assume general, long → hybrid
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

  // ── RETRIEVAL SETTINGS ────────────────────────────────────────────
  const shouldRetrieve = intent !== 'general';
  let suggestedTopK: number;

  switch (intent) {
    case 'code_action': suggestedTopK = 10; break;
    case 'project': suggestedTopK = 8; break;
    case 'hybrid': suggestedTopK = 4; break;
    default: suggestedTopK = 0;
  }

  return { intent, confidence, reasoning, shouldRetrieve, suggestedTopK };
}

/**
 * Extract key entities from the query for targeted retrieval.
 * Returns file names, function/class names, and general concepts.
 */
export function extractQueryEntities(query: string): {
  fileNames: string[];
  symbols: string[];
  concepts: string[];
} {
  const fileNames: string[] = [];
  const symbols: string[] = [];
  const concepts: string[] = [];

  // Extract file names (any extension)
  const filePattern =
    /\b([\w-]+\.(ts|tsx|js|jsx|mjs|cjs|py|java|go|rs|cpp|c|h|css|scss|html|json|yaml|yml|prisma|sql|graphql|md|sh|env|toml))\b/gi;
  let match: RegExpExecArray | null;
  while ((match = filePattern.exec(query)) !== null) {
    fileNames.push(match[1]);
  }

  // Extract symbol names (camelCase, PascalCase, snake_case)
  const symbolPattern =
    /\b([A-Z][a-zA-Z0-9]+|[a-z]+[A-Z][a-zA-Z0-9]*|[a-z]{2,}_[a-z_]+)\b/g;
  const commonWords = new Set([
    'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into',
    'create', 'make', 'build', 'write', 'give', 'show', 'tell',
    'what', 'how', 'why', 'when', 'where', 'which', 'can', 'could',
    'should', 'would', 'will', 'does', 'have', 'has', 'had',
  ]);
  while ((match = symbolPattern.exec(query)) !== null) {
    const sym = match[1];
    if (!commonWords.has(sym.toLowerCase()) && sym.length > 2) {
      symbols.push(sym);
    }
  }

  // Extract concepts (nouns after prepositions)
  const conceptPattern = /\b(about|regarding|for|of|the)\s+(\w+(?:\s+\w+)?)/gi;
  while ((match = conceptPattern.exec(query)) !== null) {
    const concept = match[2].trim();
    if (concept.length > 2) concepts.push(concept);
  }

  return {
    fileNames: Array.from(new Set(fileNames)),
    symbols: Array.from(new Set(symbols)),
    concepts: Array.from(new Set(concepts)),
  };
}