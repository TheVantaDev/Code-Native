/**
 * backend-server.contribution.ts
 *
 * Spawns the CodeNative Express backend server (`apps/backend`) as a child
 * process when the Electron app starts.  This makes `yarn start` fully
 * self-contained — no separate terminal is needed to run the backend.
 *
 * Lifecycle:
 *   onWillStart  → spawn `tsx src/server.ts` inside apps/backend
 *   onWillQuit   → kill the child process cleanly
 *
 * tsx resolution order:
 *   1. <backendDir>/node_modules/.bin/tsx  (pnpm workspace install)
 *   2. <workspaceRoot>/node_modules/.bin/tsx  (hoisted by pnpm)
 *   3. npx tsx  (downloads tsx on first run — last resort)
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawn, ChildProcess } from 'node:child_process';
import { app } from 'electron';
import { Injectable } from '@opensumi/di';
import { Domain } from '@opensumi/ide-core-common';
import { ElectronMainContribution } from './types';

const BACKEND_PORT = process.env.PORT || '3001';

@Domain(ElectronMainContribution)
@Injectable()
export class BackendServerContribution implements ElectronMainContribution {
  private backendProcess: ChildProcess | null = null;

  /** Directory of the apps/backend package (sibling of apps/desktop-new) */
  private get backendDir(): string {
    return path.resolve(app.getAppPath(), '../backend');
  }

  /** Directory of the monorepo root */
  private get workspaceRoot(): string {
    return path.resolve(app.getAppPath(), '../..');
  }

  /**
   * Find the tsx binary.
   * Checks the backend's own node_modules first, then the workspace root,
   * then falls back to 'npx' so the system can resolve it.
   */
  private resolveTsx(): { bin: string; args: string[] } {
    const candidates = [
      path.join(this.backendDir, 'node_modules', '.bin', 'tsx'),
      path.join(this.workspaceRoot, 'node_modules', '.bin', 'tsx'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return { bin: candidate, args: [] };
      }
    }

    // Fall back to npx (will install tsx on demand)
    return { bin: 'npx', args: ['tsx'] };
  }

  onWillStart(): void {
    const backendDir = this.backendDir;
    const serverEntry = path.join(backendDir, 'src', 'server.ts');

    if (!fs.existsSync(serverEntry)) {
      console.warn('[BackendServer] Backend source not found at:', serverEntry, '— skipping');
      return;
    }

    const { bin, args } = this.resolveTsx();
    const spawnArgs = [...args, 'src/server.ts'];

    console.log(`[BackendServer] Starting backend: ${bin} ${spawnArgs.join(' ')} (cwd: ${backendDir})`);

    this.backendProcess = spawn(bin, spawnArgs, {
      cwd: backendDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        PORT: BACKEND_PORT,
        NODE_ENV: process.env.NODE_ENV || 'development',
      },
    });

    this.backendProcess.on('error', (err) => {
      console.error('[BackendServer] Failed to start:', err.message);
    });

    this.backendProcess.on('exit', (code, signal) => {
      if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') {
        console.warn(`[BackendServer] Process exited unexpectedly (code=${code}, signal=${signal})`);
      }
      this.backendProcess = null;
    });
  }

  onWillQuit(): void {
    if (this.backendProcess) {
      console.log('[BackendServer] Shutting down backend process…');
      this.backendProcess.kill('SIGTERM');
      this.backendProcess = null;
    }
  }
}
