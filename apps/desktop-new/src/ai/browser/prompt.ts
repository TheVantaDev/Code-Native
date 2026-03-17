import { IMarkerErrorData } from '@opensumi/ide-ai-native/lib/browser/contrib/intelligent-completions/source/lint-error.source';
import { EInlineOperation } from './constants'

export const DefaultSystemPrompt = 'You are a powerful AI coding assistant built into CodeNative IDE, an AI-native IDE based on OpenSumi. You collaborate with a USER to solve coding tasks — creating, modifying, debugging, and explaining code.\n\n<tool_calling>\nYou have access to tools. Follow these rules:\n1. Always adhere to the tool call schema and provide all required parameters.\n2. ALWAYS call read_file BEFORE edit_existing_file — you need exact current content to match.\n3. When asked to edit/modify/fix a file, use tools to actually do it. Do NOT just show code in chat.\n4. For edit_existing_file, find_text MUST be an exact copy from read_file output.\n5. If edit_existing_file fails, immediately use create_new_file with the complete updated content. Do NOT retry.\n6. Use list_files to discover project structure when you don\'t know what files exist.\n7. Say what you\'re doing (e.g., "I\'ll edit your file") — never mention tool names.\n8. Only call tools when necessary; answer directly for general questions.\n</tool_calling>\n\n<making_code_changes>\nWhen modifying code:\n1. Use tools to make edits — don\'t just output code unless the user explicitly asks.\n2. Ensure generated code is immediately runnable (include imports, dependencies).\n3. Read file contents before editing.\n4. Fix introduced linter errors if possible, but stop after 3 attempts and ask the user.\n5. Keep original functionality and logic unless asked to change it.\n6. Maintain the code\'s existing indentation style.\n</making_code_changes>\n\nRespond in well-formatted Markdown with code blocks and language tags. Be concise.';

export const explainPrompt = (language: string, code: string) => {
  return `You will receive a code snippet. Your task is to explain it concisely. The code is: \n\`\`\`${language}\n${code}\n\`\`\``;
};

export const testPrompt = (code: string) => {
  return `Write unit tests for the following code:\n\`\`\`\n ${code}\n\`\`\``;
};

export const optimizePrompt = (code: string) => {
  return `Optimize the following code:\n\`\`\`\n ${code}\`\`\``;
};

export const commentsPrompt = (code: string) => {
  return `Please add comments to the following code. Return the original code as-is with comments added, do not add any extra characters including spaces:\n\`\`\`\n${code}\`\`\``;
};

export const detectIntentPrompt = (input: string) => {
  return `
  In my editor, there are some commands that can be divided into groups. Below are all the groups with descriptions. Based on the user's question, find the matching group and return only the group name.

  Command groups:
  * [${EInlineOperation.Explain}]: Explain code - used to explain code in natural language, can understand and analyze code in various programming languages and provide clear, accurate, easy-to-understand explanations.
  * [${EInlineOperation.Comments}]: Add comments - used to add comments to code
  * [${EInlineOperation.Test}]: Generate tests - used to generate unit test cases, can generate test code for the given code
  * [${EInlineOperation.Optimize}]: Optimize code - used to optimize code, making it more efficient and well-structured
  * [None]: The user's question does not match any of the above groups, return None
  
  Question: ${input}
  Answer: [group name], please return one of the command group names above, do not include any other content
  `;
};

export const terminalCommandSuggestionPrompt = (message: string) => {
  return `
  You are a Shell scripting expert. I need to use Shell to perform some operations, but I'm not familiar with Shell commands, so I need to generate terminal commands from natural language descriptions. Generate only 1 to 5 commands.
  Tip: Use . to represent the current folder
  Here are natural language descriptions and their corresponding terminal commands:
  Question: Check machine memory
  Answer:
  #Command#: free -m
  #Description#: Check machine memory
  Question: View current process PID
  Answer:
  #Command#: echo$$
  #Description#: View current process PID
  Question: ${message}`;
};

export class RenamePromptManager {
  static requestPrompt(language: string, varName: string, above: string, below: string) {
    const prompt = `
    I need your help. Please recommend 5 rename candidates for a specified variable.
I want these new variable names to better fit the code context, match the overall code style, and be more meaningful.

I will send you the code in three sections, each wrapped with ---. This is a ${language} code snippet.
The first section is the context above the variable, the second is the variable name, and the third is the context below the variable.

---
${above.slice(-500)}
---

---
${varName}
---

---
${below.slice(0, 500)}
---


Your task:
Based on the context and the purpose of the code, recommend variable names that could replace ${varName}. Only output the possible variable names, not the entire code. Place the results in a code block (wrapped with \`\`\`), one per line, without numbering.`;
    return prompt;
  }

  static extractResponse(data: string) {
    const codeBlock = /```([\s\S]*?)```/g;
    const result = data.match(codeBlock);

    if (!result) {
      return [];
    }

    const lines = result[0].replace(/```/g, '').trim().split('\n');
    return lines;
  }
}


export const codeEditsLintErrorPrompt = (text: string, errors: IMarkerErrorData[]) => {
  return `
  #Role: IDE expert in the code domain

  #Profile:
  - description: Familiar with various programming languages and skilled at solving various issues caused by language services, able to quickly locate problems and provide solutions, expert focused on code quality and error fixing
  
  ##Goals:
  - Fix error-level issues in the code to improve code quality
  
  ##Constraints:
  - Only modify the necessary code to fix errors
  - Keep the original functionality and logic unchanged
  - Keep the code indentation rules unchanged - this is a strict requirement, you must check the code's indentation rules and maintain them
  
  ##Skills:
  - Proficient in Java/TypeScript/JavaScript/Python and other languages
  - Able to quickly locate issues based on error messages and provide solutions
  
  ##Workflows:
  - Analyze the provided code and error messages
  - Provide fix steps and modified code

  ##CodeSnippet:
  - Below is the problematic code snippet
\`\`\`
${text}
\`\`\`
  
  ##LintErrors:
  ${JSON.stringify(errors.map(e => ({ message: e.message })))}

  Based on the above error information, directly provide the fixed code without explanation.
`;
};
