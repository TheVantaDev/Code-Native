import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Trash2, Sparkles, X, StopCircle, RefreshCw, ChevronDown, Copy, Check, Cpu, WifiOff, FileEdit, FilePlus, FolderTree, CheckCircle2, XCircle, Database } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useOllama } from '../../hooks/useOllama';
import { useUIStore } from '../../stores/uiStore';
import { useEditorStore } from '../../stores/editorStore';
import { useFileSystem } from '../../hooks/useFileSystem';
import { useAIAgent, hasFileOperations, FileOperation } from '../../hooks/useAIAgent';
import { buildAIContext, CODING_ASSISTANT_SYSTEM_PROMPT } from '../../services/projectContext';
import { FileNode } from '../../types';

// Custom syntax highlighter theme matching our new palette
const customCodeTheme = {
    ...vscDarkPlus,
    'pre[class*="language-"]': {
        ...vscDarkPlus['pre[class*="language-"]'],
        background: '#13141c',
    },
    'code[class*="language-"]': {
        ...vscDarkPlus['code[class*="language-"]'],
        background: '#13141c',
    },
};

// Code block component with action buttons
const CodeBlock: React.FC<{ language?: string; value: string }> = ({ language, value }) => {
    const [copied, setCopied] = useState(false);
    const [applied, setApplied] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newFileName, setNewFileName] = useState('');
    const { openFiles, activeFileId, updateFileContent } = useEditorStore();
    const { currentFolderPath } = useUIStore();
    const { createFile } = useFileSystem();

    const handleCopy = async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleApplyToEditor = () => {
        if (activeFileId) {
            updateFileContent(activeFileId, value);
            setApplied(true);
            setTimeout(() => setApplied(false), 2000);
        }
    };

    const handleCreateFile = async () => {
        if (!newFileName.trim()) return;
        const basePath = currentFolderPath || '.';
        const filePath = `${basePath}/${newFileName}`;
        try {
            await createFile(filePath, value);
            setShowCreateModal(false);
            setNewFileName('');
        } catch (error) {
            console.error('Failed to create file:', error);
        }
    };

    const activeFileName = openFiles.find(f => f.id === activeFileId)?.name;

    return (
        <div className="relative group my-3 rounded-lg overflow-hidden"
            style={{ border: '1px solid #292e42' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 text-[10px]"
                style={{
                    backgroundColor: '#1e1f2e',
                    borderBottom: '1px solid #292e42',
                    color: '#565f89',
                }}>
                <span className="font-mono font-medium" style={{ color: '#7aa2f7' }}>
                    {language || 'code'}
                </span>
                <div className="flex items-center gap-1">
                    {activeFileId && (
                        <button
                            onClick={handleApplyToEditor}
                            className="flex items-center gap-1 px-2 py-1 rounded transition-all cursor-pointer bg-transparent border-none"
                            style={{ color: applied ? '#9ece6a' : '#565f89' }}
                            onMouseEnter={(e) => !applied && (e.currentTarget.style.color = '#9ece6a',
                                e.currentTarget.style.backgroundColor = 'rgba(158, 206, 106, 0.1)')}
                            onMouseLeave={(e) => !applied && (e.currentTarget.style.color = '#565f89',
                                e.currentTarget.style.backgroundColor = 'transparent')}
                            title={`Apply to ${activeFileName}`}
                        >
                            {applied ? <Check size={12} /> : <FileEdit size={12} />}
                            <span>{applied ? 'Applied!' : 'Apply'}</span>
                        </button>
                    )}
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-1 px-2 py-1 rounded transition-all cursor-pointer bg-transparent border-none"
                        style={{ color: '#565f89' }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#7aa2f7';
                            e.currentTarget.style.backgroundColor = 'rgba(122, 162, 247, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = '#565f89';
                            e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        title="Create new file with this code"
                    >
                        <FilePlus size={12} />
                        <span>Create</span>
                    </button>
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-1 px-2 py-1 rounded transition-all cursor-pointer bg-transparent border-none"
                        style={{ color: copied ? '#9ece6a' : '#565f89' }}
                        onMouseEnter={(e) => !copied && (e.currentTarget.style.color = '#c0caf5',
                            e.currentTarget.style.backgroundColor = 'rgba(122, 162, 247, 0.1)')}
                        onMouseLeave={(e) => !copied && (e.currentTarget.style.color = '#565f89',
                            e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                </div>
            </div>

            {/* Create File Modal */}
            {showCreateModal && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4"
                    style={{ backgroundColor: 'rgba(26, 27, 38, 0.95)', backdropFilter: 'blur(4px)' }}>
                    <div className="w-full max-w-[250px] p-4 rounded-lg"
                        style={{
                            backgroundColor: '#1e1f2e',
                            border: '1px solid #292e42',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                        }}>
                        <h4 className="text-[12px] font-semibold mb-3" style={{ color: '#c0caf5' }}>
                            Create New File
                        </h4>
                        <input
                            type="text"
                            value={newFileName}
                            onChange={(e) => setNewFileName(e.target.value)}
                            placeholder="filename.ts"
                            className="w-full px-3 py-2 rounded text-[12px] outline-none mb-3"
                            style={{
                                backgroundColor: '#1a1b26',
                                border: '1px solid #292e42',
                                color: '#c0caf5',
                            }}
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreateFile();
                                if (e.key === 'Escape') setShowCreateModal(false);
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#7aa2f7'}
                            onBlur={(e) => e.target.style.borderColor = '#292e42'}
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={handleCreateFile}
                                className="flex-1 px-3 py-2 text-[11px] rounded font-medium transition-all cursor-pointer border-none"
                                style={{
                                    background: 'linear-gradient(135deg, #7aa2f7, #bb9af7)',
                                    color: '#1a1b26',
                                }}
                            >
                                Create
                            </button>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-3 py-2 text-[11px] rounded transition-all cursor-pointer border-none"
                                style={{ backgroundColor: '#292e42', color: '#a9b1d6' }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <SyntaxHighlighter
                style={customCodeTheme}
                language={language || 'text'}
                PreTag="div"
                customStyle={{
                    margin: 0,
                    padding: '14px 16px',
                    fontSize: '13px',
                    background: '#13141c',
                    fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
                }}
            >
                {value}
            </SyntaxHighlighter>
        </div>
    );
};

// Model selector dropdown
const ModelSelector: React.FC<{
    models: { name: string }[];
    selectedModel: string;
    onSelect: (model: string) => void;
    connectionStatus: 'connected' | 'disconnected' | 'connecting';
}> = ({ models, selectedModel, onSelect, connectionStatus }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={connectionStatus !== 'connected'}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                    backgroundColor: '#1a1b26',
                    border: '1px solid #292e42',
                    color: '#a9b1d6',
                }}
            >
                <Cpu size={12} style={{ color: '#7aa2f7' }} />
                <span className="max-w-[100px] truncate font-medium">
                    {selectedModel || 'Select Model'}
                </span>
                <ChevronDown size={12} style={{
                    transition: 'transform 0.2s ease',
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                    color: '#565f89',
                }} />
            </button>

            {isOpen && models.length > 0 && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="dropdown-menu absolute top-full left-0 mt-1 w-48 z-50 max-h-[200px] overflow-y-auto py-1">
                        {models.map((model) => (
                            <button
                                key={model.name}
                                onClick={() => { onSelect(model.name); setIsOpen(false); }}
                                className="dropdown-item w-full text-left px-3 py-2 text-[12px] cursor-pointer border-none bg-transparent"
                                style={{
                                    color: model.name === selectedModel ? '#7aa2f7' : '#a9b1d6',
                                    fontWeight: model.name === selectedModel ? 500 : 400,
                                }}
                            >
                                <div className="flex items-center gap-2">
                                    <Cpu size={12} style={{
                                        color: model.name === selectedModel ? '#7aa2f7' : '#565f89'
                                    }} />
                                    {model.name}
                                </div>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

// Connection status indicator
const ConnectionIndicator: React.FC<{ status: 'connected' | 'disconnected' | 'connecting' }> = ({ status }) => {
    const config = {
        connected: { icon: Check, color: '#9ece6a', label: 'Connected' },
        disconnected: { icon: WifiOff, color: '#f7768e', label: 'Disconnected' },
        connecting: { icon: RefreshCw, color: '#e0af68', label: 'Connecting...' },
    };

    const { icon: Icon, color, label } = config[status];

    return (
        <div className="flex items-center gap-1.5 text-[10px]" style={{ color }} title={label}>
            <div className="w-1.5 h-1.5 rounded-full" style={{
                backgroundColor: color,
                boxShadow: `0 0 6px ${color}40`,
            }} />
            <Icon size={12} className={status === 'connecting' ? 'animate-spin' : ''} />
        </div>
    );
};

// File Operation Card Component
const FileOperationCard: React.FC<{
    operation: FileOperation;
    onApply: () => void;
    onReject: () => void;
}> = ({ operation, onApply, onReject }) => {
    const fileName = operation.path.split('/').pop() || operation.path;
    const statusStyles = {
        pending: { border: 'rgba(224, 175, 104, 0.2)', bg: 'rgba(224, 175, 104, 0.05)' },
        applied: { border: 'rgba(158, 206, 106, 0.2)', bg: 'rgba(158, 206, 106, 0.05)' },
        rejected: { border: 'rgba(247, 118, 142, 0.2)', bg: 'rgba(247, 118, 142, 0.05)' },
    };
    const typeLabels = {
        create: { label: 'CREATE', color: '#9ece6a' },
        modify: { label: 'MODIFY', color: '#7aa2f7' },
        delete: { label: 'DELETE', color: '#f7768e' },
    };

    const style = statusStyles[operation.status];

    return (
        <div className="rounded-lg p-3 my-2"
            style={{
                border: `1px solid ${style.border}`,
                backgroundColor: style.bg,
                opacity: operation.status === 'rejected' ? 0.5 : 1,
            }}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold font-mono" style={{ color: typeLabels[operation.type].color }}>
                        {typeLabels[operation.type].label}
                    </span>
                    <span className="text-[12px] font-mono" style={{ color: '#a9b1d6' }}>{fileName}</span>
                </div>
                {operation.status === 'pending' && (
                    <div className="flex items-center gap-1">
                        <button
                            onClick={onApply}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-all cursor-pointer border-none font-medium"
                            style={{ backgroundColor: 'rgba(158, 206, 106, 0.15)', color: '#9ece6a' }}
                        >
                            <CheckCircle2 size={12} /> Apply
                        </button>
                        <button
                            onClick={onReject}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-all cursor-pointer border-none"
                            style={{ backgroundColor: 'rgba(122, 162, 247, 0.08)', color: '#a9b1d6' }}
                        >
                            <XCircle size={12} /> Skip
                        </button>
                    </div>
                )}
                {operation.status === 'applied' && (
                    <span className="text-[10px] flex items-center gap-1" style={{ color: '#9ece6a' }}>
                        <CheckCircle2 size={12} /> Applied
                    </span>
                )}
                {operation.status === 'rejected' && (
                    <span className="text-[10px] flex items-center gap-1" style={{ color: '#565f89' }}>
                        <XCircle size={12} /> Skipped
                    </span>
                )}
            </div>
            <div className="text-[10px] font-mono truncate" style={{ color: '#3b4261' }}>{operation.path}</div>
            {operation.content && operation.status === 'pending' && (
                <div className="mt-2 max-h-[80px] overflow-hidden rounded"
                    style={{ backgroundColor: '#13141c' }}>
                    <pre className="p-2 text-[11px] overflow-hidden font-mono" style={{ color: '#565f89' }}>
                        {operation.content.split('\n').slice(0, 4).join('\n')}
                        {operation.content.split('\n').length > 4 && '\n...'}
                    </pre>
                </div>
            )}
        </div>
    );
};

// Main AI Panel Component
export const AIPanel: React.FC = () => {
    const { isAIPanelOpen, toggleAIPanel, currentFolderPath } = useUIStore();
    const { openFiles, activeFileId } = useEditorStore();
    const { readDir } = useFileSystem();
    const {
        messages, sendMessage, isLoading, error, clearMessages,
        connectionStatus, models, selectedModel, setSelectedModel, retryConnection,
        indexProject, reindexProject, isProjectIndexed, isVectorIndexed,
    } = useOllama();

    const {
        pendingOperations, applyOperation, rejectOperation,
        applyAllOperations, processAIResponse, clearOperations,
    } = useAIAgent();

    const [input, setInput] = useState('');
    const [includeContext, setIncludeContext] = useState(true);
    const [projectFiles, setProjectFiles] = useState<FileNode[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (currentFolderPath) {
            readDir(currentFolderPath).then(setProjectFiles).catch(console.error);
        }
    }, [currentFolderPath, readDir]);

    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.role === 'assistant' && !isLoading) {
            if (hasFileOperations(lastMessage.content)) {
                processAIResponse(lastMessage.content);
            }
        }
    }, [messages, isLoading, processAIResponse]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, pendingOperations]);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [input]);
    // Auto-index project for RAG when folder is opened
    useEffect(() => {
        if (currentFolderPath && !isProjectIndexed) {
            indexProject(currentFolderPath);
        }
    }, [currentFolderPath, isProjectIndexed, indexProject]);

    if (!isAIPanelOpen) return null;

    const currentFile = openFiles.find(f => f.id === activeFileId);
    const aiContext = includeContext ? buildAIContext({
        projectStructure: projectFiles,
        currentFile: currentFile ? {
            name: currentFile.name, path: currentFile.path,
            content: currentFile.content, language: currentFile.language,
        } : undefined,
        openFiles: openFiles.map(f => ({
            name: f.name, path: f.path, language: f.language, isDirty: f.isDirty,
        })),
    }) : undefined;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;
        const msg = input;
        setInput('');

        // Get active file info for RAG context
        const currentFileForRAG = currentFile ? {
            path: currentFile.path,
            content: currentFile.content,
        } : undefined;

        await sendMessage(msg, {
            systemPrompt: CODING_ASSISTANT_SYSTEM_PROMPT,
            context: aiContext,
            projectPath: currentFolderPath || undefined,
            activeFile: currentFileForRAG,
        });
    };

    const handleClearAll = () => {
        clearMessages();
        clearOperations();
    };

    const pendingCount = pendingOperations.filter(op => op.status === 'pending').length;

    // Panel header action button
    const HeaderAction: React.FC<{
        icon: React.ReactNode;
        title: string;
        onClick?: () => void;
        active?: boolean;
        activeColor?: string;
    }> = ({ icon, title, onClick, active, activeColor }) => (
        <button
            onClick={onClick}
            className="p-1.5 rounded transition-all border-none bg-transparent cursor-pointer"
            style={{
                color: active ? (activeColor || '#9ece6a') : '#565f89',
                opacity: active ? 1 : 0.7,
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(122, 162, 247, 0.1)';
                e.currentTarget.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.opacity = active ? '1' : '0.7';
            }}
            title={title}
        >
            {icon}
        </button>
    );

    return (
        <div className="flex flex-col h-full animate-fade-in"
            style={{
                width: '380px',
                backgroundColor: '#1e1f2e',
                borderLeft: '1px solid #292e42',
                position: 'relative',
                zIndex: 20,
            }}>

            {/* Header */}
            <div className="flex items-center justify-between px-4 select-none"
                style={{
                    height: '40px',
                    borderBottom: '1px solid #292e42',
                    background: 'linear-gradient(180deg, #1e1f2e, #1a1b26)',
                }}>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase"
                        style={{ letterSpacing: '0.08em', color: '#7aa2f7' }}>
                        <Sparkles size={14} className="animate-glow" />
                        <span>AI Assistant</span>
                    </div>
                    <ConnectionIndicator status={connectionStatus} />
                    {pendingCount > 0 && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded"
                            style={{
                                background: 'rgba(224, 175, 104, 0.15)',
                                color: '#e0af68',
                            }}>
                            {pendingCount} pending
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-0.5">
                    <HeaderAction
                        icon={<FolderTree size={14} />}
                        title={includeContext ? 'Context: ON' : 'Context: OFF'}
                        onClick={() => setIncludeContext(!includeContext)}
                        active={includeContext}
                        activeColor="#9ece6a"
                    />
                    {isProjectIndexed && (
                        <HeaderAction
                            icon={<RefreshCw size={14} />}
                            title="Re-index project"
                            onClick={reindexProject}
                            active={false}
                        />
                    )}
                    {connectionStatus === 'disconnected' && (
                        <HeaderAction icon={<RefreshCw size={14} />} title="Retry" onClick={retryConnection} />
                    )}
                    <HeaderAction icon={<Trash2 size={14} />} title="Clear" onClick={handleClearAll} />
                    <HeaderAction icon={<X size={14} />} title="Close" onClick={toggleAIPanel} />
                </div>
            </div>

            {/* Model Selector + RAG mode badge */}
            <div className="px-4 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid #292e42', backgroundColor: '#1a1b26' }}>
                <ModelSelector
                    models={models}
                    selectedModel={selectedModel}
                    onSelect={setSelectedModel}
                    connectionStatus={connectionStatus}
                />
                {isProjectIndexed && (
                    <div
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold"
                        title={isVectorIndexed ? 'Hybrid BM25 + Vector search active' : 'BM25 keyword search active (vector indexing…)'}
                        style={{
                            backgroundColor: isVectorIndexed ? 'rgba(122, 162, 247, 0.12)' : 'rgba(224, 175, 104, 0.10)',
                            color: isVectorIndexed ? '#7aa2f7' : '#e0af68',
                            border: `1px solid ${isVectorIndexed ? 'rgba(122, 162, 247, 0.25)' : 'rgba(224, 175, 104, 0.2)'}`,
                        }}
                    >
                        <Database size={10} />
                        <span>{isVectorIndexed ? 'Hybrid' : 'BM25'}</span>
                        {!isVectorIndexed && (
                            <span className="w-1.5 h-1.5 rounded-full animate-pulse ml-0.5" style={{ backgroundColor: '#e0af68' }} />
                        )}
                    </div>
                )}
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3 custom-scrollbar">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 animate-float"
                            style={{
                                background: 'linear-gradient(135deg, #7aa2f7, #bb9af7)',
                                boxShadow: '0 8px 32px rgba(122, 162, 247, 0.25)',
                            }}>
                            <Bot size={40} strokeWidth={1.5} className="text-white" />
                        </div>
                        <h3 className="text-base font-semibold mb-2" style={{ color: '#c0caf5' }}>AI Assistant</h3>
                        <p className="text-[12px] max-w-[240px] leading-relaxed mb-5" style={{ color: '#565f89' }}>
                            Your local AI coding companion powered by Ollama. Ask questions, generate code, or debug issues.
                        </p>
                        {connectionStatus === 'connected' && (
                            <div className="flex flex-col items-center gap-2">
                                <div className="flex items-center gap-2 px-3 py-2 rounded-full text-[11px]"
                                    style={{
                                        backgroundColor: 'rgba(158, 206, 106, 0.08)',
                                        color: '#9ece6a',
                                        border: '1px solid rgba(158, 206, 106, 0.15)',
                                    }}>
                                    <div className="w-1.5 h-1.5 rounded-full animate-pulse"
                                        style={{ backgroundColor: '#9ece6a' }} />
                                    Connected to Ollama
                                </div>
                                {isProjectIndexed && (
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px]"
                                        style={{
                                            backgroundColor: isVectorIndexed ? 'rgba(122, 162, 247, 0.08)' : 'rgba(224, 175, 104, 0.08)',
                                            color: isVectorIndexed ? '#7aa2f7' : '#e0af68',
                                            border: `1px solid ${isVectorIndexed ? 'rgba(122, 162, 247, 0.15)' : 'rgba(224, 175, 104, 0.15)'}`,
                                        }}>
                                        <Database size={11} />
                                        <span>{isVectorIndexed ? 'Hybrid BM25 + Vector search' : 'BM25 search (vector indexing…)'}</span>
                                    </div>
                                )}
                            </div>
                        )}
                        {connectionStatus === 'disconnected' && (
                            <div className="flex flex-col items-center gap-3">
                                <div className="flex items-center gap-2 px-3 py-2 rounded-full text-[11px]"
                                    style={{
                                        backgroundColor: 'rgba(247, 118, 142, 0.08)',
                                        color: '#f7768e',
                                        border: '1px solid rgba(247, 118, 142, 0.15)',
                                    }}>
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#f7768e' }} />
                                    Not connected
                                </div>
                                <button
                                    onClick={retryConnection}
                                    className="px-4 py-2 text-[11px] rounded-lg transition-all cursor-pointer border-none font-medium"
                                    style={{
                                        background: 'linear-gradient(135deg, #7aa2f7, #bb9af7)',
                                        color: '#1a1b26',
                                    }}
                                >
                                    Retry Connection
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col gap-5">
                        {messages.map((msg, idx) => (
                            <div key={msg.id || idx} className="flex gap-3 px-1 group animate-slide-up">
                                <div className="flex-shrink-0 mt-0.5">
                                    {msg.role === 'user' ? (
                                        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                                            style={{
                                                backgroundColor: '#292e42',
                                                color: '#c0caf5',
                                            }}>
                                            <span className="text-xs font-bold">U</span>
                                        </div>
                                    ) : (
                                        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                                            style={{
                                                background: 'linear-gradient(135deg, #7aa2f7, #bb9af7)',
                                                boxShadow: '0 2px 8px rgba(122, 162, 247, 0.2)',
                                            }}>
                                            <Bot size={14} className="text-white" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span className="text-[11px] font-semibold" style={{ color: '#c0caf5' }}>
                                            {msg.role === 'user' ? 'You' : 'AI Assistant'}
                                        </span>
                                        <span className="text-[10px]" style={{ color: '#3b4261' }}>
                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div className="text-[13px] leading-relaxed prose prose-invert prose-sm max-w-none"
                                        style={{ color: '#a9b1d6' }}>
                                        {msg.role === 'assistant' ? (
                                            <ReactMarkdown
                                                components={{
                                                    code({ className, children, ...props }) {
                                                        const match = /language-(\w+)/.exec(className || '');
                                                        const isInline = !match;
                                                        return isInline ? (
                                                            <code className="bg-[rgba(122,162,247,0.08)] px-1.5 py-0.5 rounded text-[12px]"
                                                                style={{ color: '#bb9af7', fontFamily: 'var(--font-mono)' }} {...props}>
                                                                {children}
                                                            </code>
                                                        ) : (
                                                            <CodeBlock language={match[1]} value={String(children).replace(/\n$/, '')} />
                                                        );
                                                    },
                                                    p({ children }) {
                                                        return <p className="mb-2 last:mb-0">{children}</p>;
                                                    },
                                                    ul({ children }) {
                                                        return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>;
                                                    },
                                                    ol({ children }) {
                                                        return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>;
                                                    },
                                                    h1({ children }) {
                                                        return <h1 className="text-lg font-bold mb-2 mt-4" style={{ color: '#c0caf5' }}>{children}</h1>;
                                                    },
                                                    h2({ children }) {
                                                        return <h2 className="text-base font-bold mb-2 mt-3" style={{ color: '#c0caf5' }}>{children}</h2>;
                                                    },
                                                    h3({ children }) {
                                                        return <h3 className="text-sm font-bold mb-1 mt-2" style={{ color: '#c0caf5' }}>{children}</h3>;
                                                    },
                                                }}
                                            >
                                                {msg.content}
                                            </ReactMarkdown>
                                        ) : (
                                            <span className="whitespace-pre-wrap">{msg.content}</span>
                                        )}
                                        {isLoading && idx === messages.length - 1 && msg.role === 'assistant' && (
                                            <span className="inline-block w-2 h-4 ml-1 align-middle rounded-sm animate-pulse"
                                                style={{ backgroundColor: '#7aa2f7' }} />
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Pending File Operations */}
                {pendingOperations.length > 0 && (
                    <div className="mx-1 mt-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-semibold" style={{ color: '#c0caf5' }}>
                                File Operations
                            </span>
                            {pendingCount > 0 && (
                                <button
                                    onClick={applyAllOperations}
                                    className="text-[10px] px-2.5 py-1.5 rounded-md transition-all cursor-pointer border-none font-medium"
                                    style={{
                                        background: 'rgba(158, 206, 106, 0.15)',
                                        color: '#9ece6a',
                                    }}
                                >
                                    Apply All ({pendingCount})
                                </button>
                            )}
                        </div>
                        {pendingOperations.map(op => (
                            <FileOperationCard
                                key={op.id}
                                operation={op}
                                onApply={() => applyOperation(op.id)}
                                onReject={() => rejectOperation(op.id)}
                            />
                        ))}
                    </div>
                )}

                {error && (
                    <div className="mx-1 mt-4 p-3 rounded-lg flex items-center gap-2 text-xs"
                        style={{
                            backgroundColor: 'rgba(247, 118, 142, 0.08)',
                            border: '1px solid rgba(247, 118, 142, 0.15)',
                            color: '#f7768e',
                        }}>
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse"
                            style={{ backgroundColor: '#f7768e' }} />
                        {error}
                    </div>
                )}
                <div ref={messagesEndRef} className="h-4" />
            </div>

            {/* Input Area */}
            <div className="p-3" style={{
                borderTop: '1px solid #292e42',
                background: 'linear-gradient(180deg, #1a1b26, #1e1f2e)',
            }}>
                <form onSubmit={handleSubmit}
                    className="relative rounded-lg overflow-hidden transition-all"
                    style={{
                        backgroundColor: '#1a1b26',
                        border: '1px solid #292e42',
                    }}
                    onFocus={() => { }}
                >
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e);
                            }
                        }}
                        onFocus={(e) => {
                            const form = e.target.closest('form');
                            if (form) form.style.borderColor = '#7aa2f7';
                        }}
                        onBlur={(e) => {
                            const form = e.target.closest('form');
                            if (form) form.style.borderColor = '#292e42';
                        }}
                        placeholder={connectionStatus === 'connected' ? 'Ask anything... (Enter to send)' : 'Connect to Ollama to start...'}
                        disabled={connectionStatus !== 'connected'}
                        className="w-full bg-transparent border-none text-[13px] px-4 py-3 resize-none outline-none max-h-[200px] font-sans disabled:opacity-40"
                        style={{
                            color: '#c0caf5',
                            fontFamily: 'var(--font-sans)',
                        }}
                        rows={1}
                        spellCheck={false}
                    />
                    <div className="absolute right-2 bottom-2 flex items-center gap-1">
                        {isLoading ? (
                            <button
                                type="button"
                                className="p-1.5 rounded-md transition-all border-none bg-transparent cursor-pointer"
                                style={{ color: '#f7768e' }}
                                title="Stop generation"
                            >
                                <StopCircle size={16} />
                            </button>
                        ) : (
                            <button
                                type="submit"
                                disabled={!input.trim() || connectionStatus !== 'connected'}
                                className="p-1.5 rounded-md disabled:opacity-20 transition-all border-none cursor-pointer disabled:cursor-not-allowed"
                                style={{
                                    background: input.trim() ? 'linear-gradient(135deg, #7aa2f7, #bb9af7)' : '#292e42',
                                    color: input.trim() ? '#1a1b26' : '#565f89',
                                }}
                                title="Send message"
                            >
                                <Send size={14} />
                            </button>
                        )}
                    </div>
                </form>
                <div className="mt-2 flex justify-between items-center px-1">
                    <span className="text-[10px] select-none" style={{ color: '#3b4261' }}>
                        Shift+Enter for new line
                    </span>
                    {isLoading && (
                        <span className="text-[10px] flex items-center gap-1.5" style={{ color: '#7aa2f7' }}>
                            <div className="flex gap-1">
                                <span className="w-1 h-1 rounded-full animate-bounce"
                                    style={{ backgroundColor: '#7aa2f7', animationDelay: '0ms' }} />
                                <span className="w-1 h-1 rounded-full animate-bounce"
                                    style={{ backgroundColor: '#bb9af7', animationDelay: '150ms' }} />
                                <span className="w-1 h-1 rounded-full animate-bounce"
                                    style={{ backgroundColor: '#7aa2f7', animationDelay: '300ms' }} />
                            </div>
                            Generating...
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};
