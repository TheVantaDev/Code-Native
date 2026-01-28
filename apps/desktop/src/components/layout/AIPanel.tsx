import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Trash2, Sparkles, MoreHorizontal, X, StopCircle, RefreshCw, ChevronDown, Copy, Check, Cpu, Wifi, WifiOff } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useOllama } from '../../hooks/useOllama';
import { useUIStore } from '../../stores/uiStore';

// Code block component with copy button
const CodeBlock: React.FC<{ language?: string; value: string }> = ({ language, value }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group my-2 rounded-md overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#2d2d2d] text-[10px] text-gray-400 border-b border-[#404040]">
                <span>{language || 'code'}</span>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#404040] transition-colors cursor-pointer bg-transparent border-none text-gray-400"
                >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
            </div>
            <SyntaxHighlighter
                style={vscDarkPlus}
                language={language || 'text'}
                PreTag="div"
                customStyle={{
                    margin: 0,
                    padding: '12px',
                    fontSize: '13px',
                    background: '#1e1e1e',
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
                className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] bg-[var(--vscode-input-bg)] border border-[var(--vscode-input-border)] text-[var(--vscode-fg)] hover:bg-[#3c3c3c] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Cpu size={12} />
                <span className="max-w-[100px] truncate">{selectedModel || 'Select Model'}</span>
                <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && models.length > 0 && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute top-full left-0 mt-1 w-48 bg-[#252526] border border-[var(--vscode-input-border)] rounded shadow-lg z-50 max-h-[200px] overflow-y-auto">
                        {models.map((model) => (
                            <button
                                key={model.name}
                                onClick={() => {
                                    onSelect(model.name);
                                    setIsOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-[12px] hover:bg-[var(--vscode-list-hoverBg)] transition-colors cursor-pointer border-none bg-transparent text-[var(--vscode-fg)] ${model.name === selectedModel ? 'bg-[var(--vscode-list-activeSelectionBg)]' : ''
                                    }`}
                            >
                                {model.name}
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
        connected: { icon: Wifi, color: 'text-green-400', label: 'Connected' },
        disconnected: { icon: WifiOff, color: 'text-red-400', label: 'Disconnected' },
        connecting: { icon: RefreshCw, color: 'text-yellow-400', label: 'Connecting...' },
    };

    const { icon: Icon, color, label } = config[status];

    return (
        <div className={`flex items-center gap-1 text-[10px] ${color}`} title={label}>
            <Icon size={12} className={status === 'connecting' ? 'animate-spin' : ''} />
        </div>
    );
};

// Main AI Panel Component
export const AIPanel: React.FC = () => {
    const { isAIPanelOpen, toggleAIPanel } = useUIStore();
    const {
        messages,
        sendMessage,
        isLoading,
        error,
        clearMessages,
        connectionStatus,
        models,
        selectedModel,
        setSelectedModel,
        retryConnection
    } = useOllama();

    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [input]);

    if (!isAIPanelOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;
        const msg = input;
        setInput('');
        await sendMessage(msg);
    };

    return (
        <div className="flex flex-col w-[380px] h-full bg-[var(--vscode-sideBar-bg)] border-l border-[var(--vscode-panel-border)] shadow-xl relative z-20">
            {/* Header */}
            <div className="h-[40px] flex items-center justify-between px-3 select-none border-b border-[var(--vscode-panel-border)]" style={{ backgroundColor: 'var(--vscode-sideBarSectionHeader-bg)' }}>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-[var(--vscode-sideBarTitle-fg)] uppercase tracking-wide">
                        <Sparkles size={14} className="text-[#007acc]" />
                        <span>AI Assistant</span>
                    </div>
                    <ConnectionIndicator status={connectionStatus} />
                </div>
                <div className="flex items-center gap-1">
                    {connectionStatus === 'disconnected' && (
                        <button
                            onClick={retryConnection}
                            className="p-1 rounded hover:bg-[rgba(255,255,255,0.1)] text-[var(--vscode-fg)] opacity-70 hover:opacity-100 transition-opacity border-none bg-transparent cursor-pointer"
                            title="Retry Connection"
                        >
                            <RefreshCw size={14} />
                        </button>
                    )}
                    <button
                        onClick={clearMessages}
                        className="p-1 rounded hover:bg-[rgba(255,255,255,0.1)] text-[var(--vscode-fg)] opacity-70 hover:opacity-100 transition-opacity border-none bg-transparent cursor-pointer"
                        title="Clear Session"
                    >
                        <Trash2 size={14} />
                    </button>
                    <button
                        className="p-1 rounded hover:bg-[rgba(255,255,255,0.1)] text-[var(--vscode-fg)] opacity-70 hover:opacity-100 transition-opacity border-none bg-transparent cursor-pointer"
                        title="More Actions"
                    >
                        <MoreHorizontal size={14} />
                    </button>
                    <button
                        onClick={toggleAIPanel}
                        className="p-1 rounded hover:bg-[rgba(255,255,255,0.1)] text-[var(--vscode-fg)] opacity-70 hover:opacity-100 transition-opacity border-none bg-transparent cursor-pointer"
                        title="Close"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Model Selector Bar */}
            <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)] bg-[#1e1e1e]">
                <ModelSelector
                    models={models}
                    selectedModel={selectedModel}
                    onSelect={setSelectedModel}
                    connectionStatus={connectionStatus}
                />
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2 custom-scrollbar">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#007acc] to-[#0055aa] flex items-center justify-center mb-5 text-white shadow-lg shadow-[#007acc]/20">
                            <Bot size={40} strokeWidth={1.5} />
                        </div>
                        <h3 className="text-base font-semibold mb-2 text-[var(--vscode-fg)]">AI Assistant</h3>
                        <p className="text-[12px] text-[var(--vscode-descriptionForeground)] max-w-[240px] leading-relaxed mb-4">
                            Your local AI coding companion powered by Ollama. Ask questions, generate code, or debug issues.
                        </p>
                        {connectionStatus === 'connected' && (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-900/20 text-green-400 text-[11px]">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                Connected to Ollama
                            </div>
                        )}
                        {connectionStatus === 'disconnected' && (
                            <div className="flex flex-col items-center gap-2">
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-900/20 text-red-400 text-[11px]">
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                    Not connected
                                </div>
                                <button
                                    onClick={retryConnection}
                                    className="mt-2 px-3 py-1.5 text-[11px] bg-[#007acc] text-white rounded hover:bg-[#005a9e] transition-colors cursor-pointer border-none"
                                >
                                    Retry Connection
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">
                        {messages.map((msg, idx) => (
                            <div key={msg.id || idx} className="flex gap-3 px-2 group">
                                <div className="flex-shrink-0 mt-0.5">
                                    {msg.role === 'user' ? (
                                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#4a4a4a] to-[#333333] flex items-center justify-center text-white shadow-sm">
                                            <span className="text-xs font-bold">U</span>
                                        </div>
                                    ) : (
                                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#007acc] to-[#0055aa] flex items-center justify-center text-white shadow-sm">
                                            <Bot size={14} />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span className="text-[11px] font-semibold text-[var(--vscode-fg)]">
                                            {msg.role === 'user' ? 'You' : 'AI Assistant'}
                                        </span>
                                        <span className="text-[10px] opacity-40">
                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div className="text-[13px] leading-relaxed text-[var(--vscode-fg)] prose prose-invert prose-sm max-w-none">
                                        {msg.role === 'assistant' ? (
                                            <ReactMarkdown
                                                components={{
                                                    code({ className, children, ...props }) {
                                                        const match = /language-(\w+)/.exec(className || '');
                                                        const isInline = !match;
                                                        return isInline ? (
                                                            <code className="bg-[#2d2d2d] px-1.5 py-0.5 rounded text-[12px] text-[#ce9178]" {...props}>
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
                                                        return <h1 className="text-lg font-bold mb-2 mt-4">{children}</h1>;
                                                    },
                                                    h2({ children }) {
                                                        return <h2 className="text-base font-bold mb-2 mt-3">{children}</h2>;
                                                    },
                                                    h3({ children }) {
                                                        return <h3 className="text-sm font-bold mb-1 mt-2">{children}</h3>;
                                                    },
                                                }}
                                            >
                                                {msg.content}
                                            </ReactMarkdown>
                                        ) : (
                                            <span className="whitespace-pre-wrap">{msg.content}</span>
                                        )}
                                        {isLoading && idx === messages.length - 1 && msg.role === 'assistant' && (
                                            <span className="inline-block w-2 h-4 ml-1 align-middle bg-[#007acc] animate-pulse rounded-sm" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {error && (
                    <div className="mx-2 mt-4 p-3 rounded-lg bg-red-900/20 border border-red-900/40 text-red-200 text-xs flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                        {error}
                    </div>
                )}
                <div ref={messagesEndRef} className="h-4" />
            </div>

            {/* Input Area */}
            <div className="p-3 border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-bg)]">
                <form
                    onSubmit={handleSubmit}
                    className="relative bg-[var(--vscode-input-bg)] border border-[var(--vscode-input-border)] rounded-lg focus-within:ring-1 focus-within:ring-[var(--vscode-focusBorder)] focus-within:border-[var(--vscode-focusBorder)] transition-all overflow-hidden"
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
                        placeholder={connectionStatus === 'connected' ? 'Ask anything... (Enter to send)' : 'Connect to Ollama to start chatting...'}
                        disabled={connectionStatus !== 'connected'}
                        className="w-full bg-transparent border-none text-[var(--vscode-input-fg)] text-[13px] px-3 py-3 resize-none outline-none max-h-[200px] placeholder:text-[var(--vscode-input-placeholderFg)] font-sans disabled:opacity-50"
                        rows={1}
                        spellCheck={false}
                    />
                    <div className="absolute right-2 bottom-2 flex items-center gap-1">
                        {isLoading ? (
                            <button
                                type="button"
                                className="p-1.5 rounded-md hover:bg-[rgba(255,255,255,0.1)] text-red-400 border-none bg-transparent cursor-pointer transition-colors"
                                title="Stop generation"
                            >
                                <StopCircle size={16} />
                            </button>
                        ) : (
                            <button
                                type="submit"
                                disabled={!input.trim() || connectionStatus !== 'connected'}
                                className="p-1.5 rounded-md disabled:opacity-30 bg-[#007acc] hover:bg-[#005a9e] text-white border-none cursor-pointer transition-colors disabled:cursor-not-allowed"
                                title="Send message"
                            >
                                <Send size={14} />
                            </button>
                        )}
                    </div>
                </form>
                <div className="mt-2 flex justify-between items-center px-1">
                    <span className="text-[10px] opacity-40 select-none">Shift+Enter for new line</span>
                    {isLoading && (
                        <span className="text-[10px] text-[#007acc] flex items-center gap-1.5">
                            <div className="flex gap-0.5">
                                <span className="w-1 h-1 rounded-full bg-[#007acc] animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-1 h-1 rounded-full bg-[#007acc] animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-1 h-1 rounded-full bg-[#007acc] animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                            Generating...
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};
