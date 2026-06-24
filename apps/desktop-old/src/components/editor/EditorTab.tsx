import React from 'react';
import { X, Circle } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';

// Get language-specific color for file icon
const getFileColor = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const colors: Record<string, string> = {
        ts: '#3178c6',
        tsx: '#3178c6',
        js: '#e5c07b',
        jsx: '#61afef',
        json: '#e0af68',
        css: '#bb9af7',
        scss: '#c586c0',
        html: '#e34c26',
        md: '#7dcfff',
        py: '#9ece6a',
        go: '#7dcfff',
        rs: '#f7768e',
    };
    return colors[ext] || '#a9b1d6';
};

interface EditorTabProps {
    fileId: string;
    fileName: string;
    isActive: boolean;
    isDirty: boolean;
}

export const EditorTab: React.FC<EditorTabProps> = ({
    fileId,
    fileName,
    isActive,
    isDirty,
}) => {
    const { setActiveFile, closeFile } = useEditorStore();

    return (
        <div
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => setActiveFile(fileId)}
            onMouseDown={(e) => e.button === 1 && closeFile(fileId)}
            className={`tab ${isActive ? 'active' : ''}`}
            title={fileName}
        >
            {/* File Icon - colored dot per file type */}
            <span
                className="flex-shrink-0 w-3 h-3 rounded-sm mr-2"
                style={{
                    backgroundColor: getFileColor(fileName),
                    opacity: isActive ? 0.9 : 0.5,
                    transition: 'opacity 0.15s ease',
                }}
            />

            {/* File Name */}
            <span className={`tab-label ${isDirty ? 'italic' : ''}`} style={{
                fontSize: '13px',
                fontWeight: isActive ? 500 : 400,
            }}>
                {fileName}
            </span>

            {/* Close / Dirty */}
            <div className="flex items-center ml-1">
                {isDirty ? (
                    <div className="tab-dirty" />
                ) : (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            closeFile(fileId);
                        }}
                        aria-label={`Close ${fileName}`}
                        className="tab-close"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>
        </div>
    );
};
