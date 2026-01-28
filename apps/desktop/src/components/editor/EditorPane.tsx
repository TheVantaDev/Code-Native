import React, { useEffect, useCallback } from 'react';
import MonacoEditor, { OnMount } from '@monaco-editor/react';
import { useEditorStore } from '../../stores/editorStore';
import { useFileSystem } from '../../hooks/useFileSystem';

interface EditorPaneProps {
    content: string;
    language: string;
    fileId: string;
    filePath: string;
}

export const EditorPane: React.FC<EditorPaneProps> = ({ content, language, fileId, filePath }) => {
    const { updateFileContent, markFileSaved } = useEditorStore();
    const { writeFile } = useFileSystem();

    const handleChange = (value: string | undefined) => {
        if (value !== undefined) {
            updateFileContent(fileId, value);
        }
    };

    const saveFile = useCallback(async () => {
        try {
            const file = useEditorStore.getState().openFiles.find(f => f.id === fileId);
            if (file && file.isDirty) {
                await writeFile(filePath, file.content);
                markFileSaved(fileId);
                console.log(`✅ Saved: ${filePath}`);
            }
        } catch (error) {
            console.error('Failed to save file:', error);
        }
    }, [fileId, filePath, writeFile, markFileSaved]);

    // Handle Ctrl+S keyboard shortcut
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveFile();
        }
    }, [saveFile]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const handleEditorMount: OnMount = (editor) => {
        // Add Ctrl+S action to Monaco as well
        editor.addAction({
            id: 'save-file',
            label: 'Save File',
            keybindings: [2048 + 49], // Ctrl+S
            run: () => saveFile(),
        });
    };

    return (
        <div className="h-full w-full">
            <MonacoEditor
                height="100%"
                language={language}
                value={content}
                onChange={handleChange}
                onMount={handleEditorMount}
                theme="vs-dark"
                options={{
                    fontSize: 14,
                    fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                    minimap: { enabled: true },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    folding: true,
                    renderLineHighlight: 'line',
                    cursorBlinking: 'smooth',
                    smoothScrolling: true,
                }}
            />
        </div>
    );
};
