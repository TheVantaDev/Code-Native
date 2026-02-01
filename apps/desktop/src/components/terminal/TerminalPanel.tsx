import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal, X, Maximize2, Minimize2, Plus } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { useUIStore } from '../../stores/uiStore';

// Check if we're running in Electron
const isElectron = (): boolean => {
    return typeof window !== 'undefined' &&
        typeof (window as any).ipcRenderer !== 'undefined';
};

interface TerminalInstance {
    id: string;
    terminal: XTerminal;
    fitAddon: FitAddon;
    ptyId: string | null;
}

export const TerminalPanel = ({ onClose }: { onClose: () => void }) => {
    const [isMaximized, setIsMaximized] = useState(false);
    const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
    const [terminals, setTerminals] = useState<{ id: string; title: string; cwd?: string }[]>([]);
    const terminalContainerRef = useRef<HTMLDivElement>(null);
    const terminalInstancesRef = useRef<Map<string, TerminalInstance>>(new Map());
    const terminalIdCounter = useRef(0);

    // Get current project folder from UI store
    const { currentFolderPath } = useUIStore();

    const createTerminal = useCallback(async (customCwd?: string) => {
        const termId = `term-${++terminalIdCounter.current}`;
        const cwd = customCwd || currentFolderPath || undefined;

        // Get folder name for terminal title
        const folderName = cwd ? cwd.split(/[/\\]/).pop() : null;
        const termTitle = folderName ? `${folderName}` : `Terminal ${terminalIdCounter.current}`;

        // Create xterm instance
        const terminal = new XTerminal({
            theme: {
                background: '#1e1e1e',
                foreground: '#cccccc',
                cursor: '#ffffff',
                cursorAccent: '#1e1e1e',
                selectionBackground: '#264f78',
                black: '#1e1e1e',
                red: '#f44747',
                green: '#4ec9b0',
                yellow: '#dcdcaa',
                blue: '#569cd6',
                magenta: '#c586c0',
                cyan: '#9cdcfe',
                white: '#d4d4d4',
                brightBlack: '#808080',
                brightRed: '#f44747',
                brightGreen: '#4ec9b0',
                brightYellow: '#dcdcaa',
                brightBlue: '#569cd6',
                brightMagenta: '#c586c0',
                brightCyan: '#9cdcfe',
                brightWhite: '#ffffff',
            },
            fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
            fontSize: 13,
            lineHeight: 1.2,
            cursorBlink: true,
            cursorStyle: 'bar',
            scrollback: 10000,
        });

        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);

        // Store instance
        terminalInstancesRef.current.set(termId, {
            id: termId,
            terminal,
            fitAddon,
            ptyId: null,
        });

        // Add to state with folder info
        setTerminals(prev => [...prev, { id: termId, title: termTitle, cwd }]);
        setActiveTerminalId(termId);

        // If in Electron, create PTY and connect
        if (isElectron()) {
            try {
                const ipcRenderer = (window as any).ipcRenderer;

                // Create PTY with project directory as cwd
                const { id: ptyId } = await ipcRenderer.invoke('pty:create', {
                    cols: terminal.cols,
                    rows: terminal.rows,
                    cwd: cwd, // Pass project directory to PTY
                });

                // Update instance with PTY ID
                const instance = terminalInstancesRef.current.get(termId);
                if (instance) {
                    instance.ptyId = ptyId;
                }

                // Handle terminal input -> PTY
                terminal.onData((data: string) => {
                    ipcRenderer.invoke('pty:write', { id: ptyId, data });
                });

                // Handle PTY output -> terminal
                const dataHandler = (_: any, msg: { id: string; data: string }) => {
                    if (msg.id === ptyId) {
                        terminal.write(msg.data);
                    }
                };
                ipcRenderer.on('pty:data', dataHandler);

                // Handle PTY exit
                const exitHandler = (_: any, msg: { id: string; exitCode: number }) => {
                    if (msg.id === ptyId) {
                        terminal.write(`\r\n\x1b[90m[Process exited with code ${msg.exitCode}]\x1b[0m\r\n`);
                    }
                };
                ipcRenderer.on('pty:exit', exitHandler);

                // Store cleanup handlers
                (terminal as any)._cleanup = () => {
                    ipcRenderer.off('pty:data', dataHandler);
                    ipcRenderer.off('pty:exit', exitHandler);
                    ipcRenderer.invoke('pty:kill', { id: ptyId });
                };

            } catch (error) {
                console.error('Failed to create PTY:', error);
                terminal.write('Failed to connect to shell.\r\n');
            }
        } else {
            // Web mode - mock terminal
            terminal.write('CodeNative Terminal (Web Mode)\r\n');
            terminal.write('$ ');
            terminal.onData((data: string) => {
                if (data === '\r') {
                    terminal.write('\r\nCommand execution not available in web mode.\r\n$ ');
                } else if (data === '\x7f') {
                    // Backspace
                    terminal.write('\b \b');
                } else {
                    terminal.write(data);
                }
            });
        }

        return termId;
    }, []);

    // Mount first terminal on panel open
    useEffect(() => {
        if (terminals.length === 0) {
            createTerminal();
        }
    }, [createTerminal, terminals.length]);

    // Attach terminal to DOM when active terminal changes
    useEffect(() => {
        if (!activeTerminalId || !terminalContainerRef.current) return;

        const instance = terminalInstancesRef.current.get(activeTerminalId);
        if (!instance) return;

        // Clear container
        terminalContainerRef.current.innerHTML = '';

        // Open terminal in container
        instance.terminal.open(terminalContainerRef.current);
        instance.fitAddon.fit();
        instance.terminal.focus();

        // Notify PTY of resize
        if (isElectron() && instance.ptyId) {
            (window as any).ipcRenderer.invoke('pty:resize', {
                id: instance.ptyId,
                cols: instance.terminal.cols,
                rows: instance.terminal.rows,
            });
        }
    }, [activeTerminalId]);

    // Handle resize
    useEffect(() => {
        const handleResize = () => {
            if (!activeTerminalId) return;
            const instance = terminalInstancesRef.current.get(activeTerminalId);
            if (!instance) return;

            instance.fitAddon.fit();

            if (isElectron() && instance.ptyId) {
                (window as any).ipcRenderer.invoke('pty:resize', {
                    id: instance.ptyId,
                    cols: instance.terminal.cols,
                    rows: instance.terminal.rows,
                });
            }
        };

        const resizeObserver = new ResizeObserver(handleResize);
        if (terminalContainerRef.current) {
            resizeObserver.observe(terminalContainerRef.current);
        }

        return () => resizeObserver.disconnect();
    }, [activeTerminalId]);

    const closeTerminal = (termId: string) => {
        const instance = terminalInstancesRef.current.get(termId);
        if (instance) {
            // Cleanup
            if ((instance.terminal as any)._cleanup) {
                (instance.terminal as any)._cleanup();
            }
            instance.terminal.dispose();
            terminalInstancesRef.current.delete(termId);
        }

        const newTerminals = terminals.filter(t => t.id !== termId);
        setTerminals(newTerminals);

        if (activeTerminalId === termId) {
            setActiveTerminalId(newTerminals[0]?.id || null);
        }

        if (newTerminals.length === 0) {
            onClose();
        }
    };

    return (
        <div
            className={`terminal-panel ${isMaximized ? 'maximized' : ''}`}
            style={{
                position: isMaximized ? 'fixed' : 'relative',
                inset: isMaximized ? 0 : 'auto',
                height: isMaximized ? '100vh' : '280px',
                backgroundColor: '#1e1e1e',
                borderTop: '1px solid #3c3c3c',
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
                    padding: '0 8px',
                    height: '35px',
                    backgroundColor: '#252526',
                    borderBottom: '1px solid #3c3c3c',
                }}
            >
                {/* Tabs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', overflow: 'auto' }}>
                    {terminals.map((term) => (
                        <div
                            key={term.id}
                            onClick={() => setActiveTerminalId(term.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px 10px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                backgroundColor: activeTerminalId === term.id ? '#1e1e1e' : 'transparent',
                                borderBottom: activeTerminalId === term.id ? '1px solid #007acc' : '1px solid transparent',
                                color: activeTerminalId === term.id ? '#ffffff' : '#888888',
                            }}
                        >
                            <Terminal size={12} />
                            <span>{term.title}</span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    closeTerminal(term.id);
                                }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#888888',
                                    cursor: 'pointer',
                                    padding: '2px',
                                    lineHeight: 0,
                                    opacity: 0.6,
                                }}
                            >
                                <X size={10} />
                            </button>
                        </div>
                    ))}
                    <button
                        onClick={() => createTerminal()}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#888888',
                            cursor: 'pointer',
                            padding: '6px',
                            borderRadius: '4px',
                        }}
                        title="New Terminal"
                    >
                        <Plus size={14} />
                    </button>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                        onClick={() => setIsMaximized(!isMaximized)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#888888',
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
                            color: '#888888',
                            cursor: 'pointer',
                            padding: '4px',
                            borderRadius: '4px',
                        }}
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Terminal Container */}
            <div
                ref={terminalContainerRef}
                style={{
                    flex: 1,
                    padding: '4px 8px',
                    overflow: 'hidden',
                }}
            />
        </div>
    );
};

export default TerminalPanel;
