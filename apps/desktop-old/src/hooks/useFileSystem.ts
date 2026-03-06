import { useMemo, useState, useEffect } from 'react';
import { FileNode, FileSystemAPI } from '../types';

// Better Electron detection: check if IPC actually responds
// vite-plugin-electron exposes ipcRenderer even in web dev mode,
// but the Electron main process isn't running, so all IPC calls fail.
const checkElectronAvailable = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  if (typeof (window as any).ipcRenderer === 'undefined') return false;

  // Try a quick IPC ping to see if main process is alive
  try {
    // Send a dedicated ping message that the main process will just return true for
    const result = await Promise.race([
      (window as any).ipcRenderer.invoke('fs:ping'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500)),
    ]);
    return result === true;
  } catch {
    return false;
  }
};

// Mock file system data for web mode
const mockFileSystem: FileNode[] = [
  {
    id: 'src',
    name: 'src',
    path: '/src',
    type: 'folder',
    children: [
      {
        id: 'src-app',
        name: 'App.tsx',
        path: '/src/App.tsx',
        type: 'file',
        language: 'typescript',
      },
      {
        id: 'src-main',
        name: 'main.tsx',
        path: '/src/main.tsx',
        type: 'file',
        language: 'typescript',
      },
      {
        id: 'src-css',
        name: 'index.css',
        path: '/src/index.css',
        type: 'file',
        language: 'css',
      },
      {
        id: 'src-components',
        name: 'components',
        path: '/src/components',
        type: 'folder',
        children: [
          {
            id: 'src-components-button',
            name: 'Button.tsx',
            path: '/src/components/Button.tsx',
            type: 'file',
            language: 'typescript',
          },
          {
            id: 'src-components-header',
            name: 'Header.tsx',
            path: '/src/components/Header.tsx',
            type: 'file',
            language: 'typescript',
          },
        ],
      },
      {
        id: 'src-hooks',
        name: 'hooks',
        path: '/src/hooks',
        type: 'folder',
        children: [
          {
            id: 'src-hooks-useauth',
            name: 'useAuth.ts',
            path: '/src/hooks/useAuth.ts',
            type: 'file',
            language: 'typescript',
          },
        ],
      },
    ],
  },
  {
    id: 'pkg',
    name: 'package.json',
    path: '/package.json',
    type: 'file',
    language: 'json',
  },
  {
    id: 'readme',
    name: 'README.md',
    path: '/README.md',
    type: 'file',
    language: 'markdown',
  },
  {
    id: 'tsconfig',
    name: 'tsconfig.json',
    path: '/tsconfig.json',
    type: 'file',
    language: 'json',
  },
  {
    id: 'gitignore',
    name: '.gitignore',
    path: '/.gitignore',
    type: 'file',
  },
];

// Mock file contents for web mode
const mockFileContents: Record<string, string> = {
  '/src/App.tsx': `import React from 'react';
import { Header } from './components/Header';
import { Button } from './components/Button';

function App() {
  const [count, setCount] = React.useState(0);

  return (
    <div className="app">
      <Header title="CodeNative" />
      <main className="container">
        <h1>Welcome to CodeNative IDE!</h1>
        <p>Start editing to see changes.</p>
        <div className="counter">
          <p>Count: {count}</p>
          <Button onClick={() => setCount(c => c + 1)}>
            Increment
          </Button>
        </div>
      </main>
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
  '/src/index.css': `/* Design System Tokens */
:root {
  --color-primary: #7aa2f7;
  --color-secondary: #bb9af7;
  --color-success: #9ece6a;
  --color-background: #1a1b26;
  --color-surface: #1e1f2e;
  --color-text: #c0caf5;
  --font-sans: 'Inter', system-ui, sans-serif;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-sans);
  background: var(--color-background);
  color: var(--color-text);
  min-height: 100vh;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.counter {
  margin-top: 2rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}`,
  '/src/components/Button.tsx': `import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
}) => {
  const baseStyles = 'rounded-lg font-medium transition-all';
  
  const variants = {
    primary: 'bg-blue-500 hover:bg-blue-600 text-white',
    secondary: 'bg-gray-700 hover:bg-gray-600 text-gray-200',
    ghost: 'bg-transparent hover:bg-gray-800 text-gray-300',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      onClick={onClick}
      className={\`\${baseStyles} \${variants[variant]} \${sizes[size]}\`}
    >
      {children}
    </button>
  );
};`,
  '/src/components/Header.tsx': `import React from 'react';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle }) => {
  return (
    <header className="header">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </header>
  );
};`,
  '/src/hooks/useAuth.ts': `import { useState, useCallback } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // Simulated auth
      const mockUser = { id: '1', name: 'Dev User', email };
      setUser(mockUser);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
  }, []);

  return { user, isLoading, login, logout };
}`,
  '/package.json': `{
  "name": "my-project",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "typescript": "^5.2.0",
    "vite": "^5.0.0"
  }
}`,
  '/README.md': `# My Project

Welcome to your CodeNative project! 🚀

## Getting Started

1. Open files from the file explorer
2. Edit code in the Monaco editor  
3. Use **Ctrl+Shift+I** to chat with AI
4. Open the terminal with **Ctrl+\`**

## Features

- 🎨 Syntax-highlighted code editing
- 🤖 AI-powered coding assistant
- 📁 File explorer with tree view
- 💻 Integrated terminal
- 🔍 Search across files
`,
  '/tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}`,
  '/.gitignore': `node_modules
dist
.env
.env.local
*.log
.DS_Store
`,
};

// Global flag for electron availability (async-checked)
let _electronChecked = false;
let _electronAvailable = false;

export function useFileSystem(): FileSystemAPI & {
  openFolderDialog: () => Promise<string | null>;
  createFile: (path: string, content?: string) => Promise<boolean>;
  createFolder: (path: string) => Promise<boolean>;
  deleteItem: (path: string) => Promise<boolean>;
} {
  const [electronReady, setElectronReady] = useState(_electronChecked ? _electronAvailable : false);

  // Check electron availability on mount
  useEffect(() => {
    if (!_electronChecked) {
      _electronChecked = true;
      checkElectronAvailable().then(available => {
        _electronAvailable = available;
        setElectronReady(available);
        console.log(`[CodeNative] Running in ${available ? 'Electron' : 'Web'} mode`);
      });
    }
  }, []);

  return useMemo(() => ({
    isElectron: electronReady,

    readFile: async (path: string): Promise<string> => {
      if (electronReady) {
        return (window as any).ipcRenderer.invoke('fs:readFile', path);
      } else {
        return mockFileContents[path] || `// File: ${path}\n// Content not available in web mode`;
      }
    },

    writeFile: async (path: string, content: string): Promise<void> => {
      if (electronReady) {
        return (window as any).ipcRenderer.invoke('fs:writeFile', path, content);
      } else {
        mockFileContents[path] = content;
      }
    },

    readDir: async (_path: string): Promise<FileNode[]> => {
      if (electronReady) {
        return (window as any).ipcRenderer.invoke('fs:readDir', _path);
      } else {
        return mockFileSystem;
      }
    },

    openFolderDialog: async (): Promise<string | null> => {
      if (electronReady) {
        return (window as any).ipcRenderer.invoke('dialog:openFolder');
      } else {
        return prompt('Enter folder path:');
      }
    },

    createFile: async (path: string, content: string = ''): Promise<boolean> => {
      if (electronReady) {
        return (window as any).ipcRenderer.invoke('fs:createFile', path, content);
      } else {
        mockFileContents[path] = content;
        return true;
      }
    },

    createFolder: async (path: string): Promise<boolean> => {
      if (electronReady) {
        return (window as any).ipcRenderer.invoke('fs:createFolder', path);
      } else {
        return true;
      }
    },

    deleteItem: async (path: string): Promise<boolean> => {
      if (electronReady) {
        return (window as any).ipcRenderer.invoke('fs:delete', path);
      } else {
        return true;
      }
    },
  }), [electronReady]);
}
