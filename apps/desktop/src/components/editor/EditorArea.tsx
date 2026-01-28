import React from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { EditorTab } from './EditorTab';
import { EditorPane } from './EditorPane';
import { ChevronRight, Code2, Folder, FileText, Sparkles, Terminal, Keyboard, GitBranch } from 'lucide-react';

export const EditorArea: React.FC = () => {
    const { openFiles, activeFileId } = useEditorStore();
    const activeFile = openFiles.find(f => f.id === activeFileId);

    return (
        <div className="flex flex-col h-full w-full bg-[var(--vscode-editor-bg)] overflow-hidden">
            {/* Tab Header Area */}
            {openFiles.length > 0 ? (
                <div className="editor-group-header">
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
                <div className="breadcrumb">
                    <span className="breadcrumb-item">src</span>
                    <ChevronRight size={14} className="opacity-40 mx-1" />
                    <span className="breadcrumb-item">{activeFile.name}</span>
                </div>
            )}

            {/* Editor Content or Welcome */}
            <div className="editor-container">
                {activeFile ? (
                    <EditorPane
                        content={activeFile.content}
                        language={activeFile.language}
                        fileId={activeFile.id}
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
        { label: 'Show All Commands', keys: ['Ctrl', 'Shift', 'P'], icon: Terminal },
        { label: 'Go to File', keys: ['Ctrl', 'P'], icon: FileText },
        { label: 'Toggle Sidebar', keys: ['Ctrl', 'B'], icon: Folder },
        { label: 'Open AI Assistant', keys: ['Ctrl', 'Shift', 'I'], icon: Sparkles },
    ];

    const recentActions = [
        { label: 'New File', icon: FileText },
        { label: 'Open Folder', icon: Folder },
        { label: 'Clone Repository', icon: GitBranch },
    ];

    return (
        <div className="w-full h-full flex flex-col items-center justify-center text-[var(--vscode-fg)] select-none p-8">
            {/* Logo */}
            <div className="mb-8 relative">
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#007acc] to-[#0055aa] flex items-center justify-center shadow-lg shadow-[#007acc]/20">
                    <Code2 size={48} className="text-white" strokeWidth={1.5} />
                </div>
                <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                    <Sparkles size={16} className="text-white" />
                </div>
            </div>

            <h1 className="text-3xl font-light mb-2 tracking-tight">CodeNative</h1>
            <p className="opacity-50 text-sm mb-10">AI-Powered Local IDE</p>

            {/* Two Column Layout */}
            <div className="flex gap-16 max-w-2xl">
                {/* Start Section */}
                <div className="flex flex-col">
                    <h2 className="text-sm font-semibold mb-4 text-[var(--vscode-sideBarTitle-fg)] uppercase tracking-wide">Start</h2>
                    <div className="flex flex-col gap-2">
                        {recentActions.map((action, idx) => (
                            <button
                                key={idx}
                                className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-[rgba(255,255,255,0.05)] transition-colors cursor-pointer bg-transparent border-none text-left text-[var(--vscode-fg)]"
                            >
                                <action.icon size={16} className="opacity-60" />
                                <span className="text-[13px]">{action.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Shortcuts Section */}
                <div className="flex flex-col">
                    <h2 className="text-sm font-semibold mb-4 text-[var(--vscode-sideBarTitle-fg)] uppercase tracking-wide flex items-center gap-2">
                        <Keyboard size={14} />
                        Shortcuts
                    </h2>
                    <div className="flex flex-col gap-3">
                        {shortcuts.map((shortcut, idx) => (
                            <div key={idx} className="flex items-center gap-4">
                                <span className="w-40 text-[13px] opacity-80">{shortcut.label}</span>
                                <div className="flex gap-1">
                                    {shortcut.keys.map((key, keyIdx) => (
                                        <React.Fragment key={keyIdx}>
                                            <kbd className="bg-[rgba(255,255,255,0.08)] px-2 py-1 rounded text-[11px] border border-[rgba(255,255,255,0.1)] font-mono">
                                                {key}
                                            </kbd>
                                            {keyIdx < shortcut.keys.length - 1 && (
                                                <span className="opacity-40 text-xs flex items-center">+</span>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* AI Hint */}
            <div className="mt-12 flex items-center gap-3 px-4 py-2.5 rounded-full bg-gradient-to-r from-[#007acc]/10 to-purple-500/10 border border-[#007acc]/20">
                <Sparkles size={14} className="text-[#007acc]" />
                <span className="text-[12px] opacity-70">
                    Press <kbd className="bg-[rgba(255,255,255,0.1)] px-1.5 py-0.5 rounded text-[10px] mx-1 font-mono">Ctrl+Shift+I</kbd> to open AI Assistant
                </span>
            </div>
        </div>
    );
};
