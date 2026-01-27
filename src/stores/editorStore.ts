import { create } from 'zustand';
import { OpenFile } from '../types';

interface EditorState {
    openFiles: OpenFile[];
    activeFileId: string | null;

    // Actions
    openFile: (file: Omit<OpenFile, 'isDirty'>) => void;
    closeFile: (fileId: string) => void;
    setActiveFile: (fileId: string) => void;
    updateFileContent: (fileId: string, content: string) => void;
    markFileSaved: (fileId: string) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
    openFiles: [],
    activeFileId: null,

    openFile: (file) => {
        const { openFiles } = get();
        const existingFile = openFiles.find(f => f.id === file.id);

        if (existingFile) {
            // File already open, just activate it
            set({ activeFileId: file.id });
        } else {
            // Add new file to open files
            set({
                openFiles: [...openFiles, { ...file, isDirty: false }],
                activeFileId: file.id,
            });
        }
    },

    closeFile: (fileId) => {
        const { openFiles, activeFileId } = get();
        const newOpenFiles = openFiles.filter(f => f.id !== fileId);

        let newActiveFileId = activeFileId;
        if (activeFileId === fileId) {
            // If we're closing the active file, activate the previous one or the first one
            const closedIndex = openFiles.findIndex(f => f.id === fileId);
            if (newOpenFiles.length > 0) {
                newActiveFileId = newOpenFiles[Math.max(0, closedIndex - 1)]?.id ?? null;
            } else {
                newActiveFileId = null;
            }
        }

        set({ openFiles: newOpenFiles, activeFileId: newActiveFileId });
    },

    setActiveFile: (fileId) => {
        set({ activeFileId: fileId });
    },

    updateFileContent: (fileId, content) => {
        const { openFiles } = get();
        set({
            openFiles: openFiles.map(f =>
                f.id === fileId ? { ...f, content, isDirty: true } : f
            ),
        });
    },

    markFileSaved: (fileId) => {
        const { openFiles } = get();
        set({
            openFiles: openFiles.map(f =>
                f.id === fileId ? { ...f, isDirty: false } : f
            ),
        });
    },
}));
