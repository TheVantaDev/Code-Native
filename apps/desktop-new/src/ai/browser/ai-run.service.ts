import * as jsoncparser from 'jsonc-parser';
import { Injectable, Autowired } from '@opensumi/di';
import { PreferenceConfigurations } from '@opensumi/ide-core-browser';
import { CommandService, URI, FileType, ChatServiceToken } from '@opensumi/ide-core-common';
import { DEBUG_COMMANDS, DebugConfiguration } from '@opensumi/ide-debug';
import { DebugConfigurationManager } from '@opensumi/ide-debug/lib/browser/debug-configuration-manager';
import { WorkbenchEditorService } from '@opensumi/ide-editor';
import { IFileServiceClient } from '@opensumi/ide-file-service';
import { IWorkspaceService } from '@opensumi/ide-workspace';
import { ChatService } from '@opensumi/ide-ai-native/lib/browser/chat/chat.api.service';
import { AIBackSerivcePath } from '@opensumi/ide-core-common';
import type { IAIBackService } from '@opensumi/ide-core-common';
import { MessageService } from '@opensumi/ide-overlay/lib/browser/message.service';
import { IAIReporter } from '@opensumi/ide-core-common';

// Set of technical stacks
export enum EStackName {
  NODEJS = 'node.js',
  JAVA = 'java',
  MINI_PROGRAM = 'mini program',
  PYTHON = 'python',
  C_CPP = 'c/c++',
  GO = 'go',
  rust = 'rust',
  FRONT_END = 'front end',
  EXTENSION = 'ide extension',
  EMPTY = 'empty',
}

const EStackNameKeys = Object.keys(EStackName) as (keyof typeof EStackName)[];

/**
 * The logic rules for smart running are as follows:
 * Primarily based on launch.json configuration.
 *   a. If the file does not exist, intelligently generate it (via AI).
 *   b. If the file exists, run the first item by default (can be configured later).
 */
@Injectable()
export class AiRunService {
  @Autowired(AIBackSerivcePath)
  aiBackService: IAIBackService;

  @Autowired(CommandService)
  protected readonly commandService: CommandService;

  @Autowired(MessageService)
  protected readonly messageService: MessageService;

  @Autowired(IWorkspaceService)
  protected readonly workspaceService: IWorkspaceService;

  @Autowired(PreferenceConfigurations)
  protected readonly preferenceConfigurations: PreferenceConfigurations;

  @Autowired(DebugConfigurationManager)
  protected readonly debugConfigurationManager: DebugConfigurationManager;

  @Autowired(WorkbenchEditorService)
  protected readonly workbenchEditorService: WorkbenchEditorService;

  @Autowired(IFileServiceClient)
  private readonly fileSystem: IFileServiceClient;

  @Autowired(ChatServiceToken)
  protected readonly aiChatService: ChatService;

  @Autowired(IAIReporter)
  aiReporter: IAIReporter;

  get pkgUri() {
    const workspaceFolderUri = this.workspaceService.getWorkspaceRootUri(undefined);
    if (!workspaceFolderUri) {
      return null;
    }
    return workspaceFolderUri.resolve('package.json')
  }

  private async readResourceContent(resource: URI): Promise<string> {
    try {
      const { content } = await this.fileSystem.readFile(resource.toString());
      return content.toString();
    } catch (error) {
      return '';
    }
  }

  public async containPackageJson(): Promise<boolean> {
    const { pkgUri } = this;
    if (!pkgUri) return false;
    const stat = await this.fileSystem.getFileStat(pkgUri.toString());
    if (!stat) return false
    return !stat.isDirectory
  }

  public async getNodejsDebugConfigurations() {
    if (!(await this.containPackageJson())) {
      this.messageService.info(
        'Project has no package.json, unable to generate run configuration'
      );
      return
    }

    const fileContent = await this.readResourceContent(this.pkgUri!);

    const parseJson = jsoncparser.parse(fileContent);

    const jsonContent = JSON.stringify(
      {
        name: parseJson.name || '',
        version: parseJson.version || '',
        description: parseJson.description || '',
        egg: parseJson.egg || '',
        bin: parseJson.bin || '',
        scripts: parseJson.scripts
      },
      undefined,
      1
    );

    const prompt = `I will give you a project type and the contents of a package.json file. You need to analyze the scripts content inside and find the appropriate run command to start the project. If you find the appropriate command, return it directly without explanation. Please return in the format of the example Q&A below.
Question: This is a node.js project, and the contents of the package.json file are \`\`\`\n${JSON.stringify({
      scripts: { dev: 'npm run dev', test: 'npm run test' }
    })}\n\`\`\`
Answer: "dev"
Question: This is a front-end project, and the contents of the package.json file are \`\`\`\n${JSON.stringify({
      scripts: { start: 'npm run start', build: 'npm run build' }
    })}\n\`\`\`
Answer: "start"
Question: This is a Node.js project, and the contents of the package.json file are \`\`\`\n${jsonContent}\n\`\`\`
`;

    const reportRelationId = this.aiReporter.start('aiRunFrontEnd', { message: 'aiRunFrontEnd' });

    const res = await this.aiBackService.request(prompt, {
      // @ts-ignore
      maxTokens: 1600,
      enableGptCache: false
    });

    if (!res.data || res.errorCode !== 0) {
      res.errorMsg && this.messageService.info(res.errorMsg);
      // todo: 类型不对
      this.aiReporter.end(reportRelationId, { message: 'aiRunFrontEndModelFetchError', success: false });
      return undefined;
    }

    const regex = /(?:(?:npm|cnpm) run|yarn) (\w+)/; // 解析命令的正则表达式
    const backtickRegex = /`(?:(?:npm|cnpm) run|yarn) (\w+)`/; // 反引号包围的命令匹配

    // 尝试匹配基础命令
    let match = res.data.match(regex);
    // 如果基础命令未匹配，尝试匹配反引号包围的命令
    if (!match) {
      match = res.data.match(backtickRegex);
    }

    let command = '';
    if (match) {
      command = match[1]; // 提取匹配的命令名
    } else {
      // todo: 类型不对
      // this.aiReporter.end(reportRelationId, { message: 'aiRunFrontEndModelResponseUNExpected', runSuccess: false });
      return undefined;
    }

    // todo: 类型不对
    // this.aiReporter.end(reportRelationId, { message: 'aiRunFrontEndSuccess', runSuccess: true });

    // const [, command] = value;
    const configuration: DebugConfiguration = {
      name: `Run npm ${command}`,
      type: 'node',
      request: 'launch',
      runtimeExecutable: 'npm',
      runtimeArgs: ['run', `${command}`],
      cwd: '${workspaceFolder}',
      console: 'integratedTerminal',
      autoPick: true // 跳过 quickPick 自动选择（此选项不会落到用户配置中）
    };

    return [configuration];
  }
}
