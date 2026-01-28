import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

// ============ IPC Handlers for File System ============

// Read file contents
ipcMain.handle('fs:readFile', async (_, filePath: string) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return content
  } catch (error) {
    console.error('Error reading file:', error)
    throw error
  }
})

// Write file contents
ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
  try {
    await fs.writeFile(filePath, content, 'utf-8')
  } catch (error) {
    console.error('Error writing file:', error)
    throw error
  }
})

// Read directory and build file tree
interface FileNode {
  id: string
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileNode[]
}

async function buildFileTree(dirPath: string, idPrefix = ''): Promise<FileNode[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const nodes: FileNode[] = []

  // Filter out common non-editable directories
  const ignoredDirs = ['node_modules', '.git', 'dist', 'dist-electron', '.vite']

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const fullPath = path.join(dirPath, entry.name)
    const id = idPrefix ? `${idPrefix}-${i}` : `${i}`

    if (entry.isDirectory()) {
      if (!ignoredDirs.includes(entry.name)) {
        const children = await buildFileTree(fullPath, id)
        nodes.push({
          id,
          name: entry.name,
          path: fullPath,
          type: 'folder',
          children,
        })
      }
    } else {
      nodes.push({
        id,
        name: entry.name,
        path: fullPath,
        type: 'file',
      })
    }
  }

  // Sort: folders first, then alphabetically
  return nodes.sort((a, b) => {
    if (a.type === 'folder' && b.type === 'file') return -1
    if (a.type === 'file' && b.type === 'folder') return 1
    return a.name.localeCompare(b.name)
  })
}

ipcMain.handle('fs:readDir', async (_, dirPath: string) => {
  try {
    // Use project root if no path specified
    const targetPath = dirPath === '/' ? process.env.APP_ROOT! : dirPath
    return await buildFileTree(targetPath)
  } catch (error) {
    console.error('Error reading directory:', error)
    throw error
  }
})

// Open folder dialog
ipcMain.handle('dialog:openFolder', async () => {
  const { dialog } = await import('electron')
  const result = await dialog.showOpenDialog(win!, {
    properties: ['openDirectory'],
    title: 'Open Folder',
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
})

// Create new file
ipcMain.handle('fs:createFile', async (_, filePath: string, content: string = '') => {
  try {
    await fs.writeFile(filePath, content, 'utf-8')
    return true
  } catch (error) {
    console.error('Error creating file:', error)
    throw error
  }
})

// Create new folder
ipcMain.handle('fs:createFolder', async (_, folderPath: string) => {
  try {
    await fs.mkdir(folderPath, { recursive: true })
    return true
  } catch (error) {
    console.error('Error creating folder:', error)
    throw error
  }
})

// Delete file or folder
ipcMain.handle('fs:delete', async (_, targetPath: string) => {
  try {
    const stat = await fs.stat(targetPath)
    if (stat.isDirectory()) {
      await fs.rm(targetPath, { recursive: true })
    } else {
      await fs.unlink(targetPath)
    }
    return true
  } catch (error) {
    console.error('Error deleting:', error)
    throw error
  }
})

// ============ Window Control IPC Handlers ============

ipcMain.on('window-minimize', () => {
  if (win) win.minimize()
})

ipcMain.on('window-maximize', () => {
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  }
})

ipcMain.on('window-close', () => {
  if (win) win.close()
})

// ============ Window Creation ============

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1e1e1e',
      symbolColor: '#cccccc',
      height: 30,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)
