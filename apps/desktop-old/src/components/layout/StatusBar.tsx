import React from 'react';
import { GitBranch, AlertCircle, RefreshCw, Bell, WifiOff, Cpu, Sparkles, Terminal, Check } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { useUIStore } from '../../stores/uiStore';

const StatusItem: React.FC<{
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    title?: string;
    highlight?: boolean;
}> = ({ children, onClick, className, title, highlight }) => {
    const sharedStyle = {
        color: highlight ? '#1a1b26' : undefined,
        backgroundColor: highlight ? '#7aa2f7' : undefined,
    };
    const sharedClass = `status-bar-item ${className || ''} ${onClick ? 'cursor-pointer' : ''}`;

    if (onClick) {
        return (
            <button
                onClick={onClick}
                className={sharedClass}
                style={sharedStyle}
                aria-label={title}
                title={title}
            >
                {children}
            </button>
        );
    }

    return (
        <div
            className={sharedClass}
            style={sharedStyle}
            title={title}
        >
            {children}
        </div>
    );
};

// Separator
const Sep = () => (
    <div style={{ width: '1px', height: '12px', backgroundColor: '#292e42', margin: '0 2px' }} />
);

// Backend Connection Status Component
const OllamaStatus: React.FC = () => {
    const [status, setStatus] = React.useState<'connected' | 'disconnected' | 'checking'>('checking');
    const [model, setModel] = React.useState<string>('');

    React.useEffect(() => {
        const checkConnection = async () => {
            try {
                const healthResponse = await fetch('http://localhost:3001/health');
                if (!healthResponse.ok) {
                    setStatus('disconnected');
                    return;
                }
                const modelsResponse = await fetch('http://localhost:3001/api/ai/models');
                if (modelsResponse.ok) {
                    const result = await modelsResponse.json();
                    if (result.success && result.data) {
                        setStatus('connected');
                        const savedModel = localStorage.getItem('codenative_ollama_model');
                        if (savedModel) {
                            setModel(savedModel);
                        } else if (result.data.length > 0) {
                            setModel(result.data[0].name);
                        }
                    } else {
                        setStatus('disconnected');
                    }
                } else {
                    setStatus('disconnected');
                }
            } catch {
                setStatus('disconnected');
            }
        };

        checkConnection();
        const interval = setInterval(checkConnection, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <>
            <StatusItem
                title={status === 'connected' ? 'AI: Connected' : 'AI: Disconnected'}
            >
                <div className="flex items-center gap-1.5">
                    {status === 'connected' ? (
                        <>
                            <div className="w-1.5 h-1.5 rounded-full"
                                style={{
                                    backgroundColor: '#9ece6a',
                                    boxShadow: '0 0 6px rgba(158, 206, 106, 0.4)',
                                }} />
                            <Sparkles size={12} style={{ color: '#7aa2f7' }} />
                        </>
                    ) : status === 'checking' ? (
                        <RefreshCw size={12} className="animate-spin" style={{ color: '#e0af68' }} />
                    ) : (
                        <>
                            <div className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: '#f7768e' }} />
                            <WifiOff size={12} style={{ color: '#f7768e' }} />
                        </>
                    )}
                </div>
            </StatusItem>
            {status === 'connected' && model && (
                <StatusItem title={`Model: ${model}`}>
                    <Cpu size={12} style={{ color: '#bb9af7' }} />
                    <span className="text-[11px] max-w-[80px] truncate">{model.split(':')[0]}</span>
                </StatusItem>
            )}
        </>
    );
};

export const StatusBar: React.FC = () => {
    const { activeFileId, openFiles } = useEditorStore();
    const { toggleTerminal, isTerminalOpen } = useUIStore();
    const activeFile = openFiles.find(f => f.id === activeFileId);

    return (
        <div className="status-bar">
            {/* Left Section */}
            <div className="flex items-center h-full">
                <StatusItem title="Remote Host" highlight>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold">⚡</span>
                        <span className="text-[11px] font-medium">Local</span>
                    </div>
                </StatusItem>

                <StatusItem title="Git Branch">
                    <GitBranch size={12} style={{ color: '#bb9af7' }} />
                    <span className="text-[11px] font-medium">main</span>
                </StatusItem>

                <Sep />

                <StatusItem title="Problems">
                    <div className="flex items-center gap-1">
                        <Check size={11} style={{ color: '#9ece6a' }} />
                        <span className="text-[11px]">0</span>
                        <AlertCircle size={11} style={{ color: '#e0af68' }} />
                        <span className="text-[11px]">0</span>
                    </div>
                </StatusItem>

                <Sep />

                <StatusItem title="Toggle Terminal" onClick={toggleTerminal}>
                    <Terminal size={12} style={{ color: isTerminalOpen ? '#7aa2f7' : '#565f89' }} />
                </StatusItem>
            </div>

            {/* Right Section */}
            <div className="flex items-center h-full">
                {activeFile && (
                    <>
                        <StatusItem title="Line/Column">
                            <span className="text-[11px]">Ln 1, Col 1</span>
                        </StatusItem>
                        <Sep />
                        <StatusItem title="Indentation">
                            <span className="text-[11px]">Spaces: 4</span>
                        </StatusItem>
                        <Sep />
                        <StatusItem title="Encoding">
                            <span className="text-[11px]">UTF-8</span>
                        </StatusItem>
                        <Sep />
                        <StatusItem title="Language Mode">
                            <span className="text-[11px]" style={{ color: '#7aa2f7' }}>
                                {activeFile.language || 'Plain Text'}
                            </span>
                        </StatusItem>
                        <Sep />
                    </>
                )}

                {/* Ollama Status */}
                <OllamaStatus />

                <Sep />

                <StatusItem title="Notifications">
                    <Bell size={12} />
                </StatusItem>
            </div>
        </div>
    );
};
