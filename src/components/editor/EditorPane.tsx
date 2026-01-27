import React from 'react';
import MonacoEditor from '@monaco-editor/react';
import { useEditorStore } from '../../stores/editorStore';

interface EditorPaneProps {
    content: string;
    language: string;
    fileId: string;
}

export const EditorPane: React.FC<EditorPaneProps> = ({ content, language, fileId }) => {
    const { updateFileContent } = useEditorStore();

    const handleChange = (value: string | undefined) => {
        if (value !== undefined) {
            updateFileContent(fileId, value);
        }
    };

    return (
        <div className="h-full w-full">
            <MonacoEditor
                height="100%"
                language={language}
                value={content}
                onChange={handleChange}
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
