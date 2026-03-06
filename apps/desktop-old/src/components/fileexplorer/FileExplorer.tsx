import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react';
import { useFileSystem } from '../../hooks/useFileSystem';
import { useEditorStore } from '../../stores/editorStore';
import { FileNode } from '../../types';

// File icon colors matching popular icon themes
const getFileIconColor = (name: string): string => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const colors: Record<string, string> = {
        ts: '#3178c6',
        tsx: '#3178c6',
        js: '#e5c07b',
        jsx: '#61afef',
        json: '#e0af68',
        css: '#bb9af7',
        scss: '#c586c0',
        less: '#bb9af7',
        html: '#e34c26',
        xml: '#e34c26',
        md: '#7dcfff',
        py: '#9ece6a',
        go: '#7dcfff',
        rs: '#f7768e',
        java: '#f7768e',
        c: '#7dcfff',
        cpp: '#7dcfff',
        h: '#7dcfff',
        rb: '#f7768e',
        php: '#bb9af7',
        yaml: '#e0af68',
        yml: '#e0af68',
        toml: '#e0af68',
        env: '#e0af68',
        sh: '#9ece6a',
        bat: '#9ece6a',
        svg: '#e0af68',
        png: '#9ece6a',
        jpg: '#9ece6a',
        gif: '#9ece6a',
        lock: '#565f89',
        gitignore: '#565f89',
    };
    return colors[ext] || '#a9b1d6';
};

// Simple file icon component
const FileIcon: React.FC<{ name: string; isFolder?: boolean; isOpen?: boolean }> = ({
    name,
    isFolder,
    isOpen
}) => {
    if (isFolder) {
        const color = '#e0af68';
        return isOpen ? (
            <FolderOpen size={16} fill={color} stroke={color} style={{ opacity: 0.9 }} />
        ) : (
            <Folder size={16} fill={color} stroke={color} style={{ opacity: 0.8 }} />
        );
    }

    return <File size={16} stroke={getFileIconColor(name)} strokeWidth={1.5} />;
};

const getLanguage = (name: string): string => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const langs: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript',
        js: 'javascript', jsx: 'javascript',
        json: 'json', css: 'css', scss: 'scss',
        html: 'html', md: 'markdown', py: 'python',
    };
    return langs[ext] || 'plaintext';
};

interface TreeItemProps {
    node: FileNode;
    depth: number;
}

const TreeItem: React.FC<TreeItemProps> = ({ node, depth }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const { openFile, activeFileId } = useEditorStore();
    const { readFile } = useFileSystem();

    const isSelected = node.id === activeFileId;

    const handleClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (node.type === 'folder') {
            setIsExpanded(prev => !prev);
        } else {
            const content = await readFile(node.path);
            openFile({
                id: node.id,
                name: node.name,
                path: node.path,
                content,
                language: getLanguage(node.name),
            });
        }
    };

    const paddingLeft = depth * 12 + 12;

    return (
        <>
            <div
                role="treeitem"
                aria-expanded={node.type === 'folder' ? isExpanded : undefined}
                aria-selected={isSelected}
                onClick={handleClick}
                className={`list-item ${isSelected ? 'selected' : ''}`}
                style={{ paddingLeft: `${paddingLeft}px` }}
            >
                {/* Indent guides */}
                {depth > 0 && Array.from({ length: depth }).map((_, i) => (
                    <div
                        key={i}
                        className="indent-guide"
                        style={{ left: `${(i + 1) * 12 + 5}px` }}
                    />
                ))}

                {/* Content */}
                <div className="flex items-center gap-1.5 w-full">
                    {/* Twistie / Chevron */}
                    <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center"
                        style={{ opacity: 0.7, transition: 'transform 0.15s ease' }}>
                        {node.type === 'folder' && (
                            isExpanded ?
                                <ChevronDown size={14} /> :
                                <ChevronRight size={14} />
                        )}
                    </span>

                    {/* Icon */}
                    <span className="flex-shrink-0">
                        <FileIcon name={node.name} isFolder={node.type === 'folder'} isOpen={isExpanded} />
                    </span>

                    {/* Label */}
                    <span className="truncate text-[13px]">{node.name}</span>
                </div>
            </div>

            {/* Children */}
            {node.type === 'folder' && isExpanded && node.children?.map(child => (
                <TreeItem key={child.id} node={child} depth={depth + 1} />
            ))}
        </>
    );
};

interface FileExplorerProps {
    folderPath?: string | null;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({ folderPath }) => {
    const [files, setFiles] = useState<FileNode[]>([]);
    const { readDir } = useFileSystem();

    const loadFiles = useCallback(async () => {
        const pathToRead = folderPath || '/';
        const tree = await readDir(pathToRead);
        setFiles(tree);
    }, [readDir, folderPath]);

    useEffect(() => {
        loadFiles();
    }, [loadFiles]);

    return (
        <div className="flex flex-col py-0">
            {files.map(node => (
                <TreeItem key={node.id} node={node} depth={0} />
            ))}
        </div>
    );
};
