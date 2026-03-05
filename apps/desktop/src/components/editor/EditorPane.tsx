import { io } from 'socket.io-client';
import { WS_EVENTS } from '@code-native/shared';
import React, { useEffect, useCallback } from 'react';
import MonacoEditor, { OnMount, loader } from '@monaco-editor/react';
import { useEditorStore } from '../../stores/editorStore';
import { useFileSystem } from '../../hooks/useFileSystem';

// Define custom Tokyo Night theme for Monaco
const defineTokyoNightTheme = (monaco: any) => {
    monaco.editor.defineTheme('tokyo-night', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: '', foreground: 'a9b1d6', background: '1a1b26' },
            { token: 'comment', foreground: '565f89', fontStyle: 'italic' },
            { token: 'keyword', foreground: 'bb9af7' },
            { token: 'keyword.control', foreground: 'bb9af7' },
            { token: 'string', foreground: '9ece6a' },
            { token: 'string.escape', foreground: '89ddff' },
            { token: 'number', foreground: 'ff9e64' },
            { token: 'constant', foreground: 'ff9e64' },
            { token: 'type', foreground: '2ac3de' },
            { token: 'type.identifier', foreground: '2ac3de' },
            { token: 'class', foreground: '2ac3de' },
            { token: 'variable', foreground: 'c0caf5' },
            { token: 'variable.predefined', foreground: '7dcfff' },
            { token: 'function', foreground: '7aa2f7' },
            { token: 'function.declaration', foreground: '7aa2f7' },
            { token: 'operator', foreground: '89ddff' },
            { token: 'delimiter', foreground: '89ddff' },
            { token: 'delimiter.bracket', foreground: 'a9b1d6' },
            { token: 'tag', foreground: 'f7768e' },
            { token: 'tag.attribute.name', foreground: 'bb9af7' },
            { token: 'attribute.name', foreground: 'bb9af7' },
            { token: 'attribute.value', foreground: '9ece6a' },
            { token: 'regexp', foreground: 'b4f9f8' },
            { token: 'annotation', foreground: 'e0af68' },
            { token: 'meta', foreground: '565f89' },
            { token: 'identifier', foreground: 'c0caf5' },
        ],
        colors: {
            'editor.background': '#1a1b26',
            'editor.foreground': '#a9b1d6',
            'editorCursor.foreground': '#c0caf5',
            'editor.lineHighlightBackground': '#1e202e',
            'editor.lineHighlightBorder': '#1e202e',
            'editorLineNumber.foreground': '#3b4261',
            'editorLineNumber.activeForeground': '#737aa2',
            'editor.selectionBackground': '#2e3458',
            'editor.selectionHighlightBackground': '#2e345844',
            'editor.inactiveSelectionBackground': '#2e345844',
            'editor.wordHighlightBackground': '#394b7033',
            'editor.wordHighlightStrongBackground': '#394b7055',
            'editorBracketMatch.background': '#394b7033',
            'editorBracketMatch.border': '#7aa2f744',
            'editorIndentGuide.background1': '#292e42',
            'editorIndentGuide.activeBackground1': '#3b4261',
            'editorGutter.background': '#1a1b26',
            'editorWidget.background': '#1e1f2e',
            'editorWidget.border': '#292e42',
            'editorSuggestWidget.background': '#1e1f2e',
            'editorSuggestWidget.border': '#292e42',
            'editorSuggestWidget.selectedBackground': '#2e3458',
            'editorSuggestWidget.highlightForeground': '#7aa2f7',
            'editorHoverWidget.background': '#1e1f2e',
            'editorHoverWidget.border': '#292e42',
            'peekView.border': '#7aa2f7',
            'peekViewEditor.background': '#1a1b26',
            'peekViewResult.background': '#1e1f2e',
            'peekViewTitle.background': '#1e1f2e',
            'scrollbar.shadow': '#00000044',
            'scrollbarSlider.background': '#7aa2f71a',
            'scrollbarSlider.hoverBackground': '#7aa2f733',
            'scrollbarSlider.activeBackground': '#7aa2f74d',
            'minimap.background': '#1a1b26',
            'minimap.selectionHighlight': '#7aa2f744',
            'minimapSlider.background': '#7aa2f71a',
            'minimapSlider.hoverBackground': '#7aa2f733',
        },
    });
};

// Initialize theme before editor loads
loader.init().then(monaco => {
    defineTokyoNightTheme(monaco);
});

// COLLABORATION SOCKET CONNECTION
// Establishes a real-time connection to the backend using Socket.IO.
// Used to:
// - Send file updates to backend
// - Receive updates from other users
// NOTE: For now the socket is created here for simplicity.
// In future refactoring, this should move to a centralized
// socket service to avoid multiple connections.
const socket = io('http://localhost:3001');
socket.on('connect', () => {
    console.log('🟢 Connected to backend:', socket.id);
});

interface EditorPaneProps {
    content: string;
    language: string;
    fileId: string;
    filePath: string;
}

interface CodeChangePayload {
    content: string;
    userId: string;
    timestamp?: number;
}

export const EditorPane: React.FC<EditorPaneProps> = ({ content, language, fileId, filePath }) => {
    const { updateFileContent, markFileSaved } = useEditorStore();
    const { writeFile } = useFileSystem();

    const handleChange = (value: string | undefined) => {
        if (value !== undefined) {
            updateFileContent(fileId, value);

            // COLLABORATION STRATEGY
            // Whenever editor content changes:
            // 1. Update local Zustand state.
            // 2. Emit FULL file content to backend.
            //
            // Backend maintains authoritative room state.
            // If multiple users edit simultaneously,
            // the last update received by backend wins
            // ("last-write-wins" strategy).
            //
            // This is a simplified full-content sync model.
            // Future versions will replace this with CRDT (e.g., Yjs).
            socket.emit(WS_EVENTS.CODE_CHANGE, {
                content: value,
            });
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

    // REMOTE UPDATE LISTENER
    // Listens for CODE_CHANGE events from backend.
    // When another user edits the file:
    // - Backend broadcasts updated full content.
    // - We update our local Zustand store.
    //
    // IMPORTANT:
    // We ignore updates from ourselves to prevent infinite loops.
    useEffect(() => {
        const handleRemoteChange = ({ content, userId }: CodeChangePayload) => {
            if (userId === socket.id) return;
            updateFileContent(fileId, content);
        };

        socket.on(WS_EVENTS.CODE_CHANGE, handleRemoteChange);

        return () => {
            socket.off(WS_EVENTS.CODE_CHANGE, handleRemoteChange);
        };
    }, [fileId, updateFileContent]);

    const handleEditorMount: OnMount = (editor, monaco) => {
        // Ensure Tokyo Night theme is applied on mount
        defineTokyoNightTheme(monaco);
        monaco.editor.setTheme('tokyo-night');

        // Add Ctrl+S action to Monaco as well
        editor.addAction({
            id: 'save-file',
            label: 'Save File',
            keybindings: [2048 + 49], // Ctrl+S
            run: () => saveFile(),
        });
    };

    // JOIN COLLABORATION ROOM WHEN FILE OPENS
    useEffect(() => {
        if (!fileId) return;

        const userName = "User"; // temporary user identity

        // Join room using filePath as roomId (stable across clients)
        socket.emit(WS_EVENTS.JOIN_ROOM, {
            roomId: filePath,   // critical: must be same in both windows
            fileId: fileId,
            userName,
        });

        console.log("📡 Joining room:", filePath);

        return () => {
            socket.emit(WS_EVENTS.LEAVE_ROOM);
        };
    }, [fileId, filePath]);

    return (
        <div className="h-full w-full">
            <MonacoEditor
                height="100%"
                language={language}
                value={content}
                onChange={handleChange}
                onMount={handleEditorMount}
                theme="tokyo-night"
                options={{
                    fontSize: 14,
                    fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace",
                    fontLigatures: true,
                    minimap: { enabled: true, scale: 1, showSlider: 'mouseover' },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    folding: true,
                    renderLineHighlight: 'gutter',
                    cursorBlinking: 'smooth',
                    cursorSmoothCaretAnimation: 'on',
                    smoothScrolling: true,
                    bracketPairColorization: { enabled: true },
                    guides: { bracketPairs: true, indentation: true },
                    padding: { top: 8 },
                    renderWhitespace: 'selection',
                }}
            />
        </div>
    );
};
