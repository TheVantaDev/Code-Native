import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import { createServer as createHttpServer } from 'http'
import os from 'os'

// Terminal server plugin - starts Socket.IO terminal alongside Vite
function terminalServerPlugin() {
  let started = false
  return {
    name: 'vite-plugin-terminal-server',
    configureServer() {
      if (started) return
      started = true

      // Dynamically import to avoid bundling issues
      Promise.all([
        import('socket.io'),
        import('node-pty'),
      ]).then(([socketModule, ptyModule]) => {
        const { Server } = socketModule
        const pty = ptyModule.default || ptyModule

        const httpServer = createHttpServer()
        const io = new Server(httpServer, {
          cors: { origin: '*', methods: ['GET', 'POST'] },
        })

        const ptyProcesses = new Map()
        let ptyIdCounter = 0
        const shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash')

        io.on('connection', (socket) => {
          console.log('  \x1b[32m✓\x1b[0m Terminal client connected')

          socket.on('terminal:create', (options: any = {}) => {
            const id = `pty-${++ptyIdCounter}`
            try {
              const p = pty.spawn(shell, [], {
                name: 'xterm-256color',
                cols: options.cols || 80,
                rows: options.rows || 24,
                cwd: options.cwd || os.homedir(),
                env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>,
              })
              ptyProcesses.set(id, { process: p, socketId: socket.id })
              p.onData((data: string) => socket.emit('terminal:data', { id, data }))
              p.onExit(({ exitCode }: { exitCode: number }) => {
                socket.emit('terminal:exit', { id, exitCode })
                ptyProcesses.delete(id)
              })
              socket.emit('terminal:created', { id })
            } catch (e: any) {
              socket.emit('terminal:error', { id, error: e.message })
            }
          })

          socket.on('terminal:input', ({ id, data }: { id: string; data: string }) => {
            ptyProcesses.get(id)?.process.write(data)
          })

          socket.on('terminal:resize', ({ id, cols, rows }: { id: string; cols: number; rows: number }) => {
            try { ptyProcesses.get(id)?.process.resize(cols, rows) } catch { }
          })

          socket.on('terminal:kill', ({ id }: { id: string }) => {
            const entry = ptyProcesses.get(id)
            if (entry) { entry.process.kill(); ptyProcesses.delete(id) }
          })

          socket.on('disconnect', () => {
            for (const [id, entry] of ptyProcesses as any) {
              if (entry.socketId === socket.id) {
                try { entry.process.kill() } catch { }
                ptyProcesses.delete(id)
              }
            }
          })
        })

        httpServer.listen(3002, () => {
          console.log('  \x1b[36m⚡\x1b[0m Terminal server → \x1b[32mws://localhost:3002\x1b[0m')
        })
      }).catch((err) => {
        console.log(`  \x1b[33m⚠\x1b[0m Terminal: ${err.message} (web-only mode)`)
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    terminalServerPlugin(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              // Externalize node-pty so Rollup doesn't try to bundle the native module
              external: ['node-pty'],
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      renderer: process.env.NODE_ENV === 'test'
        ? undefined
        : {},
    }),
  ],
})
