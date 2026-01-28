import { useMemo } from 'react';
import { FileNode, FileSystemAPI } from '../types';

// Check if we're running in Electron
const isElectron = (): boolean => {
    return typeof window !== 'undefined' &&
        typeof (window as any).ipcRenderer !== 'undefined';
};

// Mock file system data for web mode
const mockFileSystem: FileNode[] = [
    {
        id: '1',
        name: 'src',
        path: '/src',
        type: 'folder',
        children: [
            {
                id: '2',
                name: 'App.tsx',
                path: '/src/App.tsx',
                type: 'file',
                language: 'typescript',
            },
            {
                id: '3',
                name: 'main.tsx',
                path: '/src/main.tsx',
                type: 'file',
                language: 'typescript',
            },
            {
                id: '4',
                name: 'index.css',
                path: '/src/index.css',
                type: 'file',
                language: 'css',
            },
            {
                id: '5',
                name: 'components',
                path: '/src/components',
                type: 'folder',
                children: [
                    {
                        id: '6',
                        name: 'Button.tsx',
                        path: '/src/components/Button.tsx',
                        type: 'file',
                        language: 'typescript',
                    },
                ],
            },
        ],
    },
    {
        id: '7',
        name: 'package.json',
        path: '/package.json',
        type: 'file',
        language: 'json',
    },
    {
        id: '8',
        name: 'README.md',
        path: '/README.md',
        type: 'file',
        language: 'markdown',
    },
];

// Mock file contents for web mode
const mockFileContents: Record<string, string> = {
    '/src/App.tsx': `import React from 'react';

function App() {
  return (
    <div className="app">
      <h1>Hello, CodeNative!</h1>
      <p>Start editing to see changes.</p>
    </div>
  );
}

export default App;`,
    '/src/main.tsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
    '/src/index.css': `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, sans-serif;
}`,
    '/src/components/Button.tsx': `import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
}

export const Button: React.FC<ButtonProps> = ({ children, onClick }) => {
  return (
    <button onClick={onClick} className="btn">
      {children}
    </button>
  );
};`,
    '/package.json': `{
  "name": "my-project",
  "version": "1.0.0",
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}`,
    '/README.md': `# My Project

Welcome to CodeNative IDE!

## Getting Started

1. Open files from the explorer
2. Edit code in the editor
3. Chat with AI for assistance
`,
};

export function useFileSystem(): FileSystemAPI & {
    openFolderDialog: () => Promise<string | null>;
    createFile: (path: string, content?: string) => Promise<boolean>;
    createFolder: (path: string) => Promise<boolean>;
    deleteItem: (path: string) => Promise<boolean>;
} {
    const electronAvailable = isElectron();

    return useMemo(() => ({
        isElectron: electronAvailable,

        readFile: async (path: string): Promise<string> => {
            if (electronAvailable) {
                // Use Electron IPC
                return (window as any).ipcRenderer.invoke('fs:readFile', path);
            } else {
                // Use mock data for web mode
                return mockFileContents[path] || '// File not found';
            }
        },

        writeFile: async (path: string, content: string): Promise<void> => {
            if (electronAvailable) {
                return (window as any).ipcRenderer.invoke('fs:writeFile', path, content);
            } else {
                // In web mode, just update mock data
                mockFileContents[path] = content;
            }
        },

        readDir: async (_path: string): Promise<FileNode[]> => {
            if (electronAvailable) {
                return (window as any).ipcRenderer.invoke('fs:readDir', _path);
            } else {
                // Return mock file system
                return mockFileSystem;
            }
        },

        openFolderDialog: async (): Promise<string | null> => {
            if (electronAvailable) {
                return (window as any).ipcRenderer.invoke('dialog:openFolder');
            } else {
                // Web mode: prompt for folder path (simulated)
                return prompt('Enter folder path:');
            }
        },

        createFile: async (path: string, content: string = ''): Promise<boolean> => {
            if (electronAvailable) {
                return (window as any).ipcRenderer.invoke('fs:createFile', path, content);
            } else {
                mockFileContents[path] = content;
                return true;
            }
        },

        createFolder: async (path: string): Promise<boolean> => {
            if (electronAvailable) {
                return (window as any).ipcRenderer.invoke('fs:createFolder', path);
            } else {
                return true;
            }
        },

        deleteItem: async (path: string): Promise<boolean> => {
            if (electronAvailable) {
                return (window as any).ipcRenderer.invoke('fs:delete', path);
            } else {
                return true;
            }
        },
    }), [electronAvailable]);
}
