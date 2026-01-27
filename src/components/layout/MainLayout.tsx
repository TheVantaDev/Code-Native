import React from 'react';
import { TitleBar } from './TitleBar';
import { ActivityBar } from './ActivityBar';
import { Sidebar } from './Sidebar';
import { AIPanel } from './AIPanel';
import { EditorArea } from '../editor/EditorArea';
import { StatusBar } from './StatusBar';

export const MainLayout: React.FC = () => {
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

                {/* Editor Area - Center */}
                <div className="flex-1 flex flex-col min-w-0">
                    <EditorArea />
                </div>

                {/* AI Panel - Right */}
                <AIPanel />
            </div>

            {/* Status Bar - Bottom */}
            <StatusBar />
        </div>
    );
};
