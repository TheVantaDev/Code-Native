import React from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useUIStore } from '../../stores/uiStore';
import { EditorTab } from './EditorTab';
import { EditorPane } from './EditorPane';
import { ChevronRight, Code2, Folder, FileText, Sparkles, Terminal, Keyboard, GitBranch, Zap, Bot } from 'lucide-react';

export const EditorArea: React.FC = () => {
    const { openFiles, activeFileId } = useEditorStore();
    const activeFile = openFiles.find(f => f.id === activeFileId);

    return (
        <div className="flex flex-col h-full w-full overflow-hidden"
            style={{ backgroundColor: 'var(--vscode-editor-bg)' }}>
            {/* Tab Header Area */}
            {openFiles.length > 0 ? (
                <div className="editor-group-header" role="tablist" aria-label="Open editors">
                    {openFiles.map((file) => (
                        <EditorTab
                            key={file.id}
                            fileId={file.id}
                            fileName={file.name}
                            isActive={file.id === activeFileId}
                            isDirty={file.isDirty}
                        />
                    ))}
                </div>
            ) : (
                <div className="editor-group-header" />
            )}

            {/* Breadcrumbs */}
            {activeFile && (
                <nav className="breadcrumb" aria-label="File path">
                    <span className="breadcrumb-item" style={{ color: '#565f89' }}>src</span>
                    <ChevronRight size={12} style={{ color: '#3b4261', margin: '0 4px' }} />
                    <span className="breadcrumb-item" style={{ color: '#a9b1d6' }}>{activeFile.name}</span>
                </nav>
            )}

            {/* Editor Content or Welcome */}
            <div className="editor-container">
                {activeFile ? (
                    <EditorPane
                        content={activeFile.content}
                        language={activeFile.language}
                        fileId={activeFile.id}
                        filePath={activeFile.path}
                    />
                ) : (
                    <WelcomeScreen />
                )}
            </div>
        </div>
    );
};

const WelcomeScreen: React.FC = () => {
    const shortcuts = [
        { label: 'Command Palette', keys: ['Ctrl', 'Shift', 'P'], icon: Terminal },
        { label: 'Quick Open', keys: ['Ctrl', 'P'], icon: FileText },
        { label: 'Toggle Sidebar', keys: ['Ctrl', 'B'], icon: Folder },
        { label: 'AI Assistant', keys: ['Ctrl', 'Shift', 'I'], icon: Sparkles },
        { label: 'Open Terminal', keys: ['Ctrl', '`'], icon: Terminal },
    ];

    const recentActions = [
        { label: 'New File', icon: FileText, desc: 'Create a new file' },
        { label: 'Open Folder', icon: Folder, desc: 'Open a project folder' },
        { label: 'Clone Repository', icon: GitBranch, desc: 'Clone from GitHub' },
    ];

    return (
        <div className="w-full h-full flex flex-col items-center justify-center select-none p-8"
            style={{ color: 'var(--vscode-fg)' }}>

            {/* Logo with floating animation */}
            <div className="mb-10 relative animate-float">
                <div className="w-28 h-28 rounded-2xl flex items-center justify-center"
                    style={{
                        background: 'linear-gradient(135deg, #7aa2f7, #bb9af7)',
                        boxShadow: '0 8px 40px rgba(122, 162, 247, 0.25), 0 0 60px rgba(122, 162, 247, 0.1)',
                    }}>
                    <Code2 size={56} className="text-white" strokeWidth={1.5} />
                </div>
                <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{
                        background: 'linear-gradient(135deg, #ff9e64, #f7768e)',
                        boxShadow: '0 4px 16px rgba(247, 118, 142, 0.3)',
                    }}>
                    <Zap size={18} className="text-white" />
                </div>
            </div>

            <h1 className="text-3xl font-light mb-1" style={{
                letterSpacing: '-0.02em',
                background: 'linear-gradient(135deg, #c0caf5, #7aa2f7)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
            }}>
                CodeNative
            </h1>
            <p className="text-sm mb-12" style={{ color: '#565f89' }}>AI-Powered Local IDE</p>

            {/* Two Column Layout */}
            <div className="flex gap-16 max-w-2xl animate-slide-up">
                {/* Start Section */}
                <div className="flex flex-col">
                    <h2 className="text-xs font-semibold mb-4 uppercase tracking-wider"
                        style={{ color: '#7aa2f7' }}>Start</h2>
                    <div className="flex flex-col gap-1">
                        {recentActions.map((action, idx) => (
                            <button
                                key={idx}
                                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all cursor-pointer bg-transparent border-none text-left group"
                                style={{ color: '#a9b1d6' }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = 'rgba(122, 162, 247, 0.06)';
                                    e.currentTarget.style.color = '#c0caf5';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.color = '#a9b1d6';
                                }}
                            >
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                                    style={{ backgroundColor: 'rgba(122, 162, 247, 0.08)' }}>
                                    <action.icon size={16} style={{ color: '#7aa2f7' }} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[13px] font-medium">{action.label}</span>
                                    <span className="text-[11px]" style={{ color: '#565f89' }}>{action.desc}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Shortcuts Section */}
                <div className="flex flex-col">
                    <h2 className="text-xs font-semibold mb-4 uppercase tracking-wider flex items-center gap-2"
                        style={{ color: '#7aa2f7' }}>
                        <Keyboard size={13} />
                        Shortcuts
                    </h2>
                    <div className="flex flex-col gap-3">
                        {shortcuts.map((shortcut, idx) => (
                            <div key={idx} className="flex items-center gap-4">
                                <span className="w-36 text-[13px]" style={{ color: '#a9b1d6' }}>
                                    {shortcut.label}
                                </span>
                                <div className="flex gap-1">
                                    {shortcut.keys.map((key, keyIdx) => (
                                        <React.Fragment key={keyIdx}>
                                            <kbd
                                                className="px-2 py-1 rounded text-[11px] font-mono"
                                                style={{
                                                    backgroundColor: 'rgba(122, 162, 247, 0.06)',
                                                    border: '1px solid #292e42',
                                                    color: '#a9b1d6',
                                                }}>
                                                {key}
                                            </kbd>
                                            {keyIdx < shortcut.keys.length - 1 && (
                                                <span className="flex items-center text-xs" style={{ color: '#3b4261' }}>+</span>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* AI Hint Pill */}
            <div className="mt-14 flex items-center gap-3 px-5 py-3 rounded-full"
                style={{
                    background: 'linear-gradient(135deg, rgba(122, 162, 247, 0.08), rgba(187, 154, 247, 0.08))',
                    border: '1px solid rgba(122, 162, 247, 0.15)',
                }}>
                <Bot size={16} style={{ color: '#7aa2f7' }} />
                <span className="text-[12px]" style={{ color: '#a9b1d6' }}>
                    Press
                    <kbd className="mx-1.5 px-2 py-0.5 rounded text-[10px] font-mono"
                        style={{
                            backgroundColor: 'rgba(122, 162, 247, 0.1)',
                            border: '1px solid #292e42',
                            color: '#7aa2f7',
                        }}>
                        Ctrl+Shift+I
                    </kbd>
                    to start chatting with AI
                </span>
            </div>
        </div>
    );
};
