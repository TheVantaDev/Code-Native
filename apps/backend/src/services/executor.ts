import { spawn } from 'child_process';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import type { SupportedLanguage, ExecuteResponse } from '@code-native/shared';

const TEMP_DIR = process.env.TEMP_DIR || join(process.cwd(), '.temp');
const DEFAULT_TIMEOUT = 30000; // 30 seconds

class ExecutorService {
    private tempDir: string;

    constructor() {
        this.tempDir = TEMP_DIR;
        this.ensureTempDir();
    }

    private async ensureTempDir() {
        try {
            await mkdir(this.tempDir, { recursive: true });
        } catch {
            // Directory may already exist
        }
    }

    async execute(code: string, language: SupportedLanguage, timeout = DEFAULT_TIMEOUT): Promise<ExecuteResponse> {
        const startTime = Date.now();

        switch (language) {
            case 'javascript':
                return this.executeNode(code, timeout, startTime);
            case 'typescript':
                return this.executeTypeScript(code, timeout, startTime);
            case 'python':
                return this.executePython(code, timeout, startTime);
            case 'java':
                return this.executeJava(code, timeout, startTime);
            default:
                throw new Error(`Unsupported language: ${language}`);
        }
    }

    private async executeNode(code: string, timeout: number, startTime: number): Promise<ExecuteResponse> {
        const filename = `${uuid()}.js`;
        const filepath = join(this.tempDir, filename);

        try {
            await writeFile(filepath, code, 'utf-8');
            return await this.runProcess('node', [filepath], timeout, startTime);
        } finally {
            await this.cleanup(filepath);
        }
    }

    private async executeTypeScript(code: string, timeout: number, startTime: number): Promise<ExecuteResponse> {
        const filename = `${uuid()}.ts`;
        const filepath = join(this.tempDir, filename);

        try {
            await writeFile(filepath, code, 'utf-8');
            // Use tsx for direct TypeScript execution
            return await this.runProcess('npx', ['tsx', filepath], timeout, startTime);
        } finally {
            await this.cleanup(filepath);
        }
    }

    private async executePython(code: string, timeout: number, startTime: number): Promise<ExecuteResponse> {
        const filename = `${uuid()}.py`;
        const filepath = join(this.tempDir, filename);

        try {
            await writeFile(filepath, code, 'utf-8');
            return await this.runProcess('python', [filepath], timeout, startTime);
        } finally {
            await this.cleanup(filepath);
        }
    }

    private async executeJava(code: string, timeout: number, startTime: number): Promise<ExecuteResponse> {
        // Extract class name from code
        const classMatch = code.match(/public\s+class\s+(\w+)/);
        const className = classMatch ? classMatch[1] : 'Main';

        const filename = `${className}.java`;
        const filepath = join(this.tempDir, filename);

        try {
            await writeFile(filepath, code, 'utf-8');

            // Compile
            const compileResult = await this.runProcess('javac', [filepath], timeout, startTime);
            if (compileResult.exitCode !== 0) {
                return compileResult;
            }

            // Run
            return await this.runProcess('java', ['-cp', this.tempDir, className], timeout, startTime);
        } finally {
            await this.cleanup(filepath);
            await this.cleanup(join(this.tempDir, `${className}.class`));
        }
    }

    private runProcess(command: string, args: string[], timeout: number, startTime: number): Promise<ExecuteResponse> {
        return new Promise((resolve) => {
            let stdout = '';
            let stderr = '';
            let killed = false;

            const process = spawn(command, args, {
                timeout,
                cwd: this.tempDir,
            });

            const timer = setTimeout(() => {
                killed = true;
                process.kill('SIGTERM');
            }, timeout);

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (exitCode) => {
                clearTimeout(timer);
                resolve({
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    exitCode: exitCode ?? 1,
                    executionTime: Date.now() - startTime,
                    error: killed ? 'Execution timed out' : undefined,
                });
            });

            process.on('error', (error) => {
                clearTimeout(timer);
                resolve({
                    stdout: '',
                    stderr: error.message,
                    exitCode: 1,
                    executionTime: Date.now() - startTime,
                    error: error.message,
                });
            });
        });
    }

    private async cleanup(filepath: string) {
        try {
            await unlink(filepath);
        } catch {
            // File may not exist
        }
    }
}

export const executorService = new ExecutorService();
