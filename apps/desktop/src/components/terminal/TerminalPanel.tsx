import { useEffect, useRef, useState } from 'react';
import { Terminal, X, Maximize2, Minimize2 } from 'lucide-react';

// Terminal Panel Component
// Uses a simple command history for now - will connect to backend for real PTY later
export const TerminalPanel = ({ onClose }: { onClose: () => void }) => {
    const [history, setHistory] = useState<Array<{ type: 'input' | 'output' | 'error'; content: string }>>([
        { type: 'output', content: 'CodeNative Terminal v1.0.0' },
        { type: 'output', content: 'Type "help" for available commands.\n' },
    ]);
    const [currentInput, setCurrentInput] = useState('');
    const [isMaximized, setIsMaximized] = useState(false);
    const terminalRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Scroll to bottom when history changes
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [history]);

    useEffect(() => {
        // Focus input on mount
        inputRef.current?.focus();
    }, []);

    const processCommand = async (command: string) => {
        const trimmedCmd = command.trim();
        if (!trimmedCmd) return;

        // Add input to history
        setHistory(prev => [...prev, { type: 'input', content: `$ ${trimmedCmd}` }]);

        // Built-in commands
        if (trimmedCmd === 'help') {
            setHistory(prev => [...prev, {
                type: 'output',
                content: `Available commands:
  help     - Show this help message
  clear    - Clear terminal
  version  - Show version info
  
To run code, use the Run button in the editor toolbar.`
            }]);
            return;
        }

        if (trimmedCmd === 'clear') {
            setHistory([]);
            return;
        }

        if (trimmedCmd === 'version') {
            setHistory(prev => [...prev, { type: 'output', content: 'CodeNative IDE v1.0.0\nElectron + React + Monaco Editor' }]);
            return;
        }

        // For other commands, try to execute via backend (placeholder for now)
        try {
            // TODO: Connect to backend /api/execute endpoint
            setHistory(prev => [...prev, {
                type: 'error',
                content: `Command execution not yet connected to backend.\nUse the Run button in the editor to execute code.`
            }]);
        } catch (error) {
            setHistory(prev => [...prev, {
                type: 'error',
                content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            processCommand(currentInput);
            setCurrentInput('');
        }
    };

    const handleTerminalClick = () => {
        inputRef.current?.focus();
    };

    return (
        <div
            className={`terminal-panel ${isMaximized ? 'maximized' : ''}`}
            style={{
                position: isMaximized ? 'fixed' : 'relative',
                inset: isMaximized ? 0 : 'auto',
                height: isMaximized ? '100vh' : '250px',
                backgroundColor: 'var(--bg-primary)',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                zIndex: isMaximized ? 100 : 1,
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 12px',
                    backgroundColor: 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border-color)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Terminal size={14} />
                    <span style={{ fontSize: '12px', fontWeight: 500 }}>Terminal</span>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                        onClick={() => setIsMaximized(!isMaximized)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            padding: '4px',
                            borderRadius: '4px',
                        }}
                    >
                        {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            padding: '4px',
                            borderRadius: '4px',
                        }}
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Terminal Content */}
            <div
                ref={terminalRef}
                onClick={handleTerminalClick}
                style={{
                    flex: 1,
                    padding: '12px',
                    fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
                    fontSize: '13px',
                    lineHeight: 1.5,
                    overflowY: 'auto',
                    cursor: 'text',
                }}
            >
                {history.map((entry, i) => (
                    <div
                        key={i}
                        style={{
                            color: entry.type === 'error'
                                ? '#f14c4c'
                                : entry.type === 'input'
                                    ? '#4fc1ff'
                                    : 'var(--text-primary)',
                            whiteSpace: 'pre-wrap',
                            marginBottom: '4px',
                        }}
                    >
                        {entry.content}
                    </div>
                ))}

                {/* Input Line */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ color: '#4fc1ff', marginRight: '8px' }}>$</span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={currentInput}
                        onChange={(e) => setCurrentInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: 'var(--text-primary)',
                            fontFamily: 'inherit',
                            fontSize: 'inherit',
                            caretColor: 'var(--accent-color)',
                        }}
                        autoFocus
                    />
                </div>
            </div>
        </div>
    );
};

export default TerminalPanel;
