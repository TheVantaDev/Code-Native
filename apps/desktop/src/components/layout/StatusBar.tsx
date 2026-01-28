import React from 'react';
import { GitBranch, AlertCircle, RefreshCw, Bell, Wifi, WifiOff, Cpu, Sparkles } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';

const StatusItem: React.FC<{
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    title?: string;
}> = ({ children, onClick, className, title }) => (
    <div
        onClick={onClick}
        className={`status-bar-item flex items-center gap-1.5 px-2.5 h-full ${className || ''} ${onClick ? 'cursor-pointer' : ''}`}
        title={title}
    >
        {children}
    </div>
);

// Ollama Status Component (Self-contained for now)
const OllamaStatus: React.FC = () => {
    // This would ideally come from a global store, but for now we'll simulate
    const [status, setStatus] = React.useState<'connected' | 'disconnected' | 'checking'>('checking');
    const [model, setModel] = React.useState<string>('');

    React.useEffect(() => {
        const checkConnection = async () => {
            try {
                const response = await fetch('http://localhost:11434/api/tags');
                if (response.ok) {
                    const data = await response.json();
                    setStatus('connected');
                    // Get saved model or first available
                    const savedModel = localStorage.getItem('codenative_ollama_model');
                    if (savedModel) {
                        setModel(savedModel);
                    } else if (data.models && data.models.length > 0) {
                        setModel(data.models[0].name);
                    }
                } else {
                    setStatus('disconnected');
                }
            } catch {
                setStatus('disconnected');
            }
        };

        checkConnection();
        const interval = setInterval(checkConnection, 30000); // Check every 30s
        return () => clearInterval(interval);
    }, []);

    return (
        <>
            <StatusItem
                className={status === 'connected' ? 'hover:bg-[var(--vscode-statusBar-hoverBg)]' : ''}
                title={status === 'connected' ? 'Ollama Connected' : 'Ollama Disconnected'}
            >
                <div className="flex items-center gap-1.5">
                    {status === 'connected' ? (
                        <>
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                            <Sparkles size={12} />
                        </>
                    ) : status === 'checking' ? (
                        <>
                            <RefreshCw size={12} className="animate-spin" />
                        </>
                    ) : (
                        <>
                            <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            <WifiOff size={12} />
                        </>
                    )}
                </div>
            </StatusItem>
            {status === 'connected' && model && (
                <StatusItem title={`Current Model: ${model}`}>
                    <Cpu size={12} />
                    <span className="text-[11px] max-w-[80px] truncate">{model.split(':')[0]}</span>
                </StatusItem>
            )}
        </>
    );
};

export const StatusBar: React.FC = () => {
    const { activeFileId, openFiles } = useEditorStore();
    const activeFile = openFiles.find(f => f.id === activeFileId);

    return (
        <div className="status-bar">
            {/* Left Section */}
            <div className="flex items-center h-full">
                <StatusItem className="bg-[var(--vscode-statusBar-remoteBg)]" title="Remote Host">
                    <div className="font-bold text-xs">{"💻"}</div>
                    <span className="text-[11px] font-medium">Local</span>
                </StatusItem>

                <StatusItem title="Git Branch">
                    <GitBranch size={12} />
                    <span className="text-[11px] font-medium">main*</span>
                </StatusItem>

                <StatusItem title="Sync Changes">
                    <RefreshCw size={12} />
                </StatusItem>

                <StatusItem title="Problems">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[11px]">0</span>
                        <AlertCircle size={12} />
                        <span className="text-[11px]">0</span>
                    </div>
                </StatusItem>
            </div>

            {/* Right Section */}
            <div className="flex items-center h-full">
                {activeFile && (
                    <>
                        <StatusItem title="Line/Column">
                            <span className="text-[11px]">Ln 1, Col 1</span>
                        </StatusItem>
                        <StatusItem title="Indentation">
                            <span className="text-[11px]">Spaces: 4</span>
                        </StatusItem>
                        <StatusItem title="Encoding">
                            <span className="text-[11px]">UTF-8</span>
                        </StatusItem>
                        <StatusItem title="Language Mode">
                            <span className="text-[11px]">{activeFile.language || 'Plain Text'}</span>
                        </StatusItem>
                    </>
                )}

                {/* Ollama Status */}
                <OllamaStatus />

                <StatusItem title="Notifications">
                    <Bell size={12} />
                </StatusItem>
            </div>
        </div>
    );
};
