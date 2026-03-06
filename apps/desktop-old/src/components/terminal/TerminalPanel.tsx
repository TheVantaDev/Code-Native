import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal, X, Maximize2, Minimize2, Plus } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { useUIStore } from '../../stores/uiStore';
import { io, Socket } from 'socket.io-client';

const TERMINAL_SERVER_URL = 'http://localhost:3002';

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
    const [serverConnected, setServerConnected] = useState(false);
    const terminalContainerRef = useRef<HTMLDivElement>(null);
    const terminalInstancesRef = useRef<Map<string, TerminalInstance>>(new Map());
    const terminalIdCounter = useRef(0);
    const socketRef = useRef<Socket | null>(null);
    const { currentFolderPath } = useUIStore();

    // Drag resize state
    const [panelHeight, setPanelHeight] = useState(280);
    const isDragging = useRef(false);
    const startY = useRef(0);
    const startHeight = useRef(0);

    // Connect to terminal server via WebSocket
    useEffect(() => {
        const socket = io(TERMINAL_SERVER_URL, {
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 2000,
        });

        socket.on('connect', () => {
            console.log('[Terminal] Connected to terminal server');
            setServerConnected(true);
        });

        socket.on('disconnect', () => {
            console.log('[Terminal] Disconnected from terminal server');
            setServerConnected(false);
        });

        socket.on('connect_error', () => {
            setServerConnected(false);
        });

        // Handle PTY data from server
        socket.on('terminal:data', ({ id, data }: { id: string; data: string }) => {
            // Find the terminal instance that has this ptyId
            for (const instance of terminalInstancesRef.current.values()) {
                if (instance.ptyId === id) {
                    instance.terminal.write(data);
                    break;
                }
            }
        });

        // Handle PTY exit
        socket.on('terminal:exit', ({ id, exitCode }: { id: string; exitCode: number }) => {
            for (const instance of terminalInstancesRef.current.values()) {
                if (instance.ptyId === id) {
                    instance.terminal.write(`\r\n\x1b[38;2;86;95;137m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
                    break;
                }
            }
        });

        socketRef.current = socket;

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, []);

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        isDragging.current = true;
        startY.current = e.clientY;
        startHeight.current = panelHeight;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';

        const handleResizeMove = (e: MouseEvent) => {
            if (!isDragging.current) return;
            const delta = startY.current - e.clientY;
            const newHeight = Math.max(120, Math.min(startHeight.current + delta, window.innerHeight * 0.8));
            setPanelHeight(newHeight);
        };

        const handleResizeEnd = () => {
            isDragging.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', handleResizeMove);
            document.removeEventListener('mouseup', handleResizeEnd);
        };

        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
    }, [panelHeight]);

    const createTerminal = useCallback(async (customCwd?: string) => {
        const termId = `term-${++terminalIdCounter.current}`;
        const cwd = customCwd || currentFolderPath || undefined;
        const folderName = cwd ? cwd.split(/[/\\]/).pop() : null;
        const termTitle = folderName ? `${folderName}` : `Terminal ${terminalIdCounter.current}`;

        const terminal = new XTerminal({
            theme: {
                background: '#1a1b26',
                foreground: '#a9b1d6',
                cursor: '#c0caf5',
                cursorAccent: '#1a1b26',
                selectionBackground: 'rgba(122, 162, 247, 0.2)',
                black: '#1a1b26',
                red: '#f7768e',
                green: '#9ece6a',
                yellow: '#e0af68',
                blue: '#7aa2f7',
                magenta: '#bb9af7',
                cyan: '#7dcfff',
                white: '#a9b1d6',
                brightBlack: '#565f89',
                brightRed: '#f7768e',
                brightGreen: '#9ece6a',
                brightYellow: '#e0af68',
                brightBlue: '#7aa2f7',
                brightMagenta: '#bb9af7',
                brightCyan: '#7dcfff',
                brightWhite: '#c0caf5',
            },
            fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, monospace',
            fontSize: 13,
            lineHeight: 1.3,
            cursorBlink: true,
            cursorStyle: 'bar',
            scrollback: 10000,
        });

        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);

        terminalInstancesRef.current.set(termId, {
            id: termId,
            terminal,
            fitAddon,
            ptyId: null,
        });

        setTerminals(prev => [...prev, { id: termId, title: termTitle, cwd }]);
        setActiveTerminalId(termId);

        const socket = socketRef.current;

        if (socket && socket.connected) {
            // Request PTY creation from server
            socket.emit('terminal:create', {
                cols: terminal.cols || 80,
                rows: terminal.rows || 24,
                cwd: cwd || undefined,
            });

            // Wait for server to confirm creation
            const ptyCreatedHandler = ({ id: ptyId }: { id: string }) => {
                const instance = terminalInstancesRef.current.get(termId);
                if (instance) {
                    instance.ptyId = ptyId;
                }
                socket.off('terminal:created', ptyCreatedHandler);
            };
            socket.on('terminal:created', ptyCreatedHandler);

            // Send terminal input to server
            terminal.onData((data: string) => {
                const instance = terminalInstancesRef.current.get(termId);
                if (instance?.ptyId) {
                    socket.emit('terminal:input', { id: instance.ptyId, data });
                }
            });
        } else {
            // Fallback: web mode (no backend)
            terminal.write('\x1b[38;2;247;118;142m⚠ Terminal server not running\x1b[0m\r\n\r\n');
            terminal.write('\x1b[38;2;86;95;137mTo enable the terminal, run:\x1b[0m\r\n');
            terminal.write('\x1b[38;2;158;206;106m  node terminal-server.mjs\x1b[0m\r\n\r\n');
            terminal.write('\x1b[38;2;86;95;137mThen refresh the page.\x1b[0m\r\n\r\n');

            // Minimal web mode commands
            let currentLine = '';
            terminal.write('\x1b[38;2;158;206;106m❯\x1b[0m ');
            terminal.onData((data: string) => {
                if (data === '\r') {
                    const cmd = currentLine.trim();
                    currentLine = '';
                    terminal.write('\r\n');
                    if (cmd === 'help') {
                        terminal.write('\x1b[38;2;122;162;247mRun "node terminal-server.mjs" for a real terminal.\x1b[0m\r\n');
                    } else if (cmd === 'clear') {
                        terminal.clear();
                    } else if (cmd) {
                        terminal.write(`\x1b[38;2;247;118;142mTerminal server not connected.\x1b[0m\r\n`);
                    }
                    terminal.write('\x1b[38;2;158;206;106m❯\x1b[0m ');
                } else if (data === '\x7f') {
                    if (currentLine.length > 0) {
                        currentLine = currentLine.slice(0, -1);
                        terminal.write('\b \b');
                    }
                } else if (data === '\x03') {
                    currentLine = '';
                    terminal.write('^C\r\n\x1b[38;2;158;206;106m❯\x1b[0m ');
                } else {
                    currentLine += data;
                    terminal.write(data);
                }
            });
        }

        return termId;
    }, [currentFolderPath]);

    useEffect(() => {
        if (terminals.length === 0) createTerminal();
    }, [createTerminal, terminals.length]);

    useEffect(() => {
        if (!activeTerminalId || !terminalContainerRef.current) return;
        const instance = terminalInstancesRef.current.get(activeTerminalId);
        if (!instance) return;
        terminalContainerRef.current.innerHTML = '';
        instance.terminal.open(terminalContainerRef.current);
        instance.fitAddon.fit();
        instance.terminal.focus();

        // Resize PTY on server
        if (instance.ptyId && socketRef.current?.connected) {
            socketRef.current.emit('terminal:resize', {
                id: instance.ptyId,
                cols: instance.terminal.cols,
                rows: instance.terminal.rows,
            });
        }
    }, [activeTerminalId]);

    useEffect(() => {
        const handleResize = () => {
            if (!activeTerminalId) return;
            const instance = terminalInstancesRef.current.get(activeTerminalId);
            if (!instance) return;
            instance.fitAddon.fit();
            if (instance.ptyId && socketRef.current?.connected) {
                socketRef.current.emit('terminal:resize', {
                    id: instance.ptyId,
                    cols: instance.terminal.cols,
                    rows: instance.terminal.rows,
                });
            }
        };

        const resizeObserver = new ResizeObserver(handleResize);
        if (terminalContainerRef.current) resizeObserver.observe(terminalContainerRef.current);
        return () => resizeObserver.disconnect();
    }, [activeTerminalId]);

    const closeTerminal = (termId: string) => {
        const instance = terminalInstancesRef.current.get(termId);
        if (instance) {
            // Kill PTY on server
            if (instance.ptyId && socketRef.current?.connected) {
                socketRef.current.emit('terminal:kill', { id: instance.ptyId });
            }
            instance.terminal.dispose();
            terminalInstancesRef.current.delete(termId);
        }
        const newTerminals = terminals.filter(t => t.id !== termId);
        setTerminals(newTerminals);
        if (activeTerminalId === termId) setActiveTerminalId(newTerminals[0]?.id || null);
        if (newTerminals.length === 0) onClose();
    };

    // Action button sub-component
    const ActionBtn = ({ onClick, children, title, hoverColor }: {
        onClick: () => void; children: React.ReactNode; title?: string; hoverColor?: string;
    }) => (
        <button
            onClick={onClick}
            className="flex items-center justify-center p-1 rounded transition-all cursor-pointer bg-transparent border-none"
            style={{ color: '#565f89' }}
            onMouseEnter={(e) => {
                e.currentTarget.style.color = hoverColor || '#c0caf5';
                e.currentTarget.style.backgroundColor = 'rgba(122, 162, 247, 0.1)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.color = '#565f89';
                e.currentTarget.style.backgroundColor = 'transparent';
            }}
            title={title}
        >
            {children}
        </button>
    );

    return (
        <div
            className="terminal-panel"
            style={{
                position: isMaximized ? 'fixed' : 'relative',
                inset: isMaximized ? 0 : 'auto',
                height: isMaximized ? '100vh' : `${panelHeight}px`,
                backgroundColor: '#1a1b26',
                borderTop: '1px solid #292e42',
                display: 'flex',
                flexDirection: 'column',
                zIndex: isMaximized ? 100 : 1,
            }}
        >
            {/* Drag resize handle */}
            {!isMaximized && (
                <div
                    className="terminal-resize-handle"
                    onMouseDown={handleResizeStart}
                />
            )}

            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 8px',
                    height: '36px',
                    background: 'linear-gradient(180deg, #1e1f2e, #1a1b26)',
                    borderBottom: '1px solid #292e42',
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
                                padding: '5px 12px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                backgroundColor: activeTerminalId === term.id ? '#1a1b26' : 'transparent',
                                borderBottom: activeTerminalId === term.id ? '2px solid #7aa2f7' : '2px solid transparent',
                                color: activeTerminalId === term.id ? '#c0caf5' : '#565f89',
                                borderRadius: '4px 4px 0 0',
                                transition: 'all 0.15s ease',
                                fontWeight: activeTerminalId === term.id ? 500 : 400,
                            }}
                        >
                            <Terminal size={12} />
                            <span>{term.title}</span>
                            {/* Connection indicator */}
                            <div style={{
                                width: '5px',
                                height: '5px',
                                borderRadius: '50%',
                                backgroundColor: serverConnected ? '#9ece6a' : '#f7768e',
                                boxShadow: serverConnected
                                    ? '0 0 4px rgba(158, 206, 106, 0.4)'
                                    : '0 0 4px rgba(247, 118, 142, 0.4)',
                            }} />
                            <button
                                onClick={(e) => { e.stopPropagation(); closeTerminal(term.id); }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#565f89',
                                    cursor: 'pointer',
                                    padding: '2px',
                                    lineHeight: 0,
                                    opacity: 0.5,
                                    borderRadius: '3px',
                                    transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.opacity = '1';
                                    e.currentTarget.style.color = '#f7768e';
                                    e.currentTarget.style.backgroundColor = 'rgba(247, 118, 142, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.opacity = '0.5';
                                    e.currentTarget.style.color = '#565f89';
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                            >
                                <X size={10} />
                            </button>
                        </div>
                    ))}
                    <ActionBtn onClick={() => createTerminal()} title="New Terminal">
                        <Plus size={14} />
                    </ActionBtn>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '2px' }}>
                    <ActionBtn onClick={() => setIsMaximized(!isMaximized)} title={isMaximized ? 'Restore' : 'Maximize'}>
                        {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </ActionBtn>
                    <ActionBtn onClick={onClose} title="Close" hoverColor="#f7768e">
                        <X size={14} />
                    </ActionBtn>
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
