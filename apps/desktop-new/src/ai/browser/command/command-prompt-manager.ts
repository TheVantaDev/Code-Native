import { Injectable } from '@opensumi/di';

import { BasePromptManager } from '@opensumi/ide-ai-native/lib/common/prompts/base-prompt-manager';

export interface PromptOption {
  language?: string;
  useCot?: boolean;
}

@Injectable()
export class AICommandPromptManager extends BasePromptManager {
  groupCommand(commandString: string, option?: PromptOption) {
    return this.removeExtraSpace(option?.language === 'zh' ? this.zhGroupCommandPrompt(commandString, option?.useCot) : this.enGroupCommandPrompt(commandString, option?.useCot));
  }

  private groupCommandCotPrompt = `
    Commands: git.commit,git.commitStaged,theme.toggle
    Output:
    * [File and Editor Management]: 
    * [Version Control and Git]: git.commit,git.commitStaged
    * [Debugging and Testing]: 
    * [Terminal and Command Line]: 
    * [User Interface and Layout Management]: theme.toggle
    * [Code Editing and Refactoring]: 
    * [Search and Navigation]: 
    * [Extensions and Customization]: 
    * [Data Science and Notebooks]: 
    * [Accessibility and Help]: 
  `;

  private enGroupCommandPrompt(commands: string, useCot = true) {
    return `
      In my software, there are some commands that can be categorized into different groups. I will provide all the groups, group descriptions, and the commands in the system. Please help me find the appropriate group for these commands, based on the command names or descriptions.
      
      Groups:
      * [File and Editor Management]: Includes commands related to file operations such as creation, opening, saving, closing, and other file management functions.
      * [Version Control and Git]: Covers commands related to version control systems, especially Git, including committing changes, branch operations, pulling, and pushing.
      * [Debugging and Testing]: Encompasses commands related to debugging programs and testing code, such as starting or stopping debugging sessions, setting breakpoints, and running tests.
      * [Terminal and Command Line]: Includes commands related to managing the terminal and command-line interface, such as opening, splitting the terminal, executing terminal commands, etc.
      * [User Interface and Layout Management]:  Involves commands for customizing the user interface and editor layout, including adjusting sidebars, changing view layouts, theme switching, etc.
      * [Code Editing and Refactoring]: Comprises text editing and code refactoring commands, including formatting, refactoring, text editing, code navigation, and more.
      * [Search and Navigation]: Focuses on commands for code searching and navigation, including symbol search, in-file search, and navigating to specific code locations.
      * [Extensions and Customization]: Pertains to commands for installing, managing, and configuring extensions and plugins, as well as extension-specific functionalities.
      * [Data Science and Notebooks]: Includes commands for operations with data science and Jupyter Notebooks, such as running cells, exporting notebooks, etc.
      * [Accessibility and Help]: Covers commands that enhance accessibility features and user support, such as accessing help documentation, enabling accessibility features, etc.
      
      ${useCot ? this.groupCommandCotPrompt : ''}

      Commands: ${commands}
      Output:
    `;
  }

  private zhGroupCommandPrompt(commands: string, useCot = true) {
    return this.enGroupCommandPrompt(commands, useCot);
  }

  searchGroup(input: string, option?: PromptOption) {
    return this.removeExtraSpace(option?.language === 'zh' ? this.zhSearchGroupPrompt(input, option?.useCot) : this.enSearchGroupPrompt(input, option?.useCot));
  }

  private searchGroupCotPrompt = `
    Input: commit code
    Output: commit code maybe in group [Version Control and Git]
    Input: zoom font
    Output: zoom font maybe in group [Code Editing and Refactoring]
  `;

  private enSearchGroupPrompt(input: string, useCot?: boolean) {
    return `
      In my software, there are some commands that can be grouped into several categories. Below are all the groups and a brief description of each group. Please identify the corresponding group based on the functionality provided by the user.

      Groups:
      * [File and Editor Management]: Includes commands related to file operations such as creation, opening, saving, closing, and other file management functions.
      * [Version Control and Git]: Covers commands related to version control systems, especially Git, including committing changes, branch operations, pulling, and pushing.
      * [Debugging and Testing]: Encompasses commands related to debugging programs and testing code, such as starting or stopping debugging sessions, setting breakpoints, and running tests.
      * [Terminal and Command Line]: Includes commands related to managing the terminal and command-line interface, such as opening, splitting the terminal, executing terminal commands, etc.
      * [User Interface and Layout Management]:  Involves commands for customizing the user interface and editor layout, including adjusting sidebars, changing view layouts, theme switching, etc.
      * [Code Editing and Refactoring]: Comprises text editing and code refactoring commands, including formatting, refactoring, text editing, code navigation, and more.
      * [Search and Navigation]: Focuses on commands for code searching and navigation, including symbol search, in-file search, and navigating to specific code locations.
      * [Extensions and Customization]: Pertains to commands for installing, managing, and configuring extensions and plugins, as well as extension-specific functionalities.
      * [Data Science and Notebooks]: Includes commands for operations with data science and Jupyter Notebooks, such as running cells, exporting notebooks, etc.
      * [Accessibility and Help]: Covers commands that enhance accessibility features and user support, such as accessing help documentation, enabling accessibility features, etc.
      
      ${useCot ? this.searchGroupCotPrompt : ''}
      Input：${input}
      Output: [group name]
    `;
  }

  private zhSearchGroupPrompt(input: string, useCot?: boolean) {
    return this.enSearchGroupPrompt(input, useCot);
  }

  findCommand(input: { commands: string; question: string }, option?: PromptOption) {
    return this.removeExtraSpace(option?.language === 'zh' ? this.zhFindCommandPrompt(input, option?.useCot) : this.enFindCommandPrompt(input, option?.useCot));
  }

  private findCommandCotPrompt = `
    Question: open global keybindings configuration
    Answer: By analyzing the requirement "open global keybindings configuration", some keywords can be obtained: open, keybinding, global. Through these keywords, the relevant command in the Command list can be matched as: \`workbench.action.openGlobalKeybindings\`
    Question: commit code
    Answer: By analyzing the requirement "commit code", some keywords can be obtained: git, commit. Through these keywords, the relevant command in the Command list can be matched as: \`git.commit\`
  `;

  private enFindCommandPrompt(input: { commands: string; question: string }, useCot = true) {
    return `
      In my system, there are some Commands. Through these commands, certain functions can be achieved. Please analyze my question to determine the function I want to implement, and match the appropriate Command.
      Please refer to the example Q&A below and return in the format of the example answer. If no suitable command is found, please return 'No suitable command found.'
      I will provide all the commands in the system and their descriptions in the format of {command}-{description}. When analyzing the question, please refer to both the command and its description.
      Below are all the Commands and their descriptions in the system:
      ${input.commands}
      {workbench.action.openGlobalKeybindings}-{Keybindings}
      {editor.action.setEncoding}-{set encoding}
      
      ${useCot ? this.findCommandCotPrompt : ''}
      Question: ${input.question}
    `;
  }

  private zhFindCommandPrompt(input: { commands: string; question: string }, useCot = true) {
    return this.enFindCommandPrompt(input, useCot);
  }

  private zhIDEPrompt(input: string) {
    return `You are an OpenSumi expert. You need to provide corresponding solutions for the problems encountered by users. The solution should be output in markdown format. The current user problem is: ${input}.`;
  }

  findIDECapabilityPrompt(input: string) {
    return this.removeExtraSpace(this.zhIDEPrompt(input));
  }
}
