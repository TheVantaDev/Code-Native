import { io } from 'socket.io-client';
import { WS_EVENTS } from '@code-native/shared';
import React, { useEffect, useCallback } from 'react';
import MonacoEditor, { OnMount } from '@monaco-editor/react';
import { useEditorStore } from '../../stores/editorStore';
import { useFileSystem } from '../../hooks/useFileSystem';

// COLLABORATION SOCKET CONNECTION (Level 1 )
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

    const handleEditorMount: OnMount = (editor) => {
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
