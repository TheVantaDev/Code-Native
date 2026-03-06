import React, { useEffect } from 'react';
import { TitleBar } from './TitleBar';
import { ActivityBar } from './ActivityBar';
import { Sidebar } from './Sidebar';
import { AIPanel } from './AIPanel';
import { EditorArea } from '../editor/EditorArea';
import { StatusBar } from './StatusBar';
import { TerminalPanel } from '../terminal/TerminalPanel';
import { useUIStore } from '../../stores/uiStore';

export const MainLayout: React.FC = () => {
    const { isTerminalOpen, toggleTerminal } = useUIStore();

    // Keyboard shortcut: Ctrl+` to toggle terminal
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === '`') {
                e.preventDefault();
                toggleTerminal();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggleTerminal]);

    return (
        <div
            className="flex flex-col h-screen w-screen overflow-hidden"
            style={{ backgroundColor: 'var(--vscode-editor-background)' }}
        >
            {/* Title Bar - Top */}
            <TitleBar />

            {/* Main Content Area */}
            <div className="flex flex-1 min-h-0">
                {/* Activity Bar - Far Left */}
                <ActivityBar />

                {/* Sidebar - Left */}
                <Sidebar />

                {/* Editor + Terminal Area - Center */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex-1 min-h-0">
                        <EditorArea />
                    </div>
                    {isTerminalOpen && (
                        <TerminalPanel onClose={toggleTerminal} />
                    )}
                </div>

                {/* AI Panel - Right */}
                <AIPanel />
            </div>

            {/* Status Bar - Bottom */}
            <StatusBar />
        </div>
    );
};
