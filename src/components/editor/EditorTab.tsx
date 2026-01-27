import React from 'react';
import { X, Circle } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';

// Get language-specific color for file icon
const getFileColor = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const colors: Record<string, string> = {
        ts: '#3178c6',
        tsx: '#3178c6',
        js: '#f1e05a',
        jsx: '#61dafb',
        json: '#cbcb41',
        css: '#563d7c',
        scss: '#c6538c',
        html: '#e34c26',
        md: '#083fa1',
        py: '#3572A5',
    };
    return colors[ext] || '#cccccc';
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
            onClick={() => setActiveFile(fileId)}
            onMouseDown={(e) => e.button === 1 && closeFile(fileId)}
            className={`tab ${isActive ? 'active' : ''}`}
            title={fileName}
        >
            {/* File Icon */}
            <span
                className="tab-icon font-bold"
                style={{ color: getFileColor(fileName), fontSize: '14px', marginRight: '6px' }}
            >
                {/* Simplified icon representation for tabs, often just a color dot or file type icon */}
                {/* Using a pseudo-icon (letter) or just color block for simplicity/performance */}
                {fileName.split('.').pop()?.toUpperCase().slice(0, 2) || 'TX'}
            </span>

            {/* File Name */}
            <span className={`tab-label ${isDirty ? 'italic' : ''}`}>
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
                        className="tab-close"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>
        </div>
    );
};
