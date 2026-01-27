import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react';
import { useFileSystem } from '../../hooks/useFileSystem';
import { useEditorStore } from '../../stores/editorStore';
import { FileNode } from '../../types';

// Simple file icon component with colored extensions
const FileIcon: React.FC<{ name: string; isFolder?: boolean; isOpen?: boolean }> = ({
    name,
    isFolder,
    isOpen
}) => {
    if (isFolder) {
        return isOpen ? (
            <FolderOpen size={16} fill="#dcb67a" stroke="#dcb67a" />
        ) : (
            <Folder size={16} fill="#dcb67a" stroke="#dcb67a" />
        );
    }

    const ext = name.split('.').pop()?.toLowerCase() || '';
    let color = '#cccccc'; // Default file color

    switch (ext) {
        case 'ts': case 'tsx': color = '#3178c6'; break;
        case 'js': case 'jsx': color = '#f1e05a'; break;
        case 'css': case 'scss': case 'less': color = '#563d7c'; break;
        case 'html': case 'xml': color = '#e34c26'; break;
        case 'json': color = '#cbcb41'; break;
        case 'md': color = '#3572A5'; break; // Markdown blue
        case 'py': color = '#3572A5'; break;
        case 'go': color = '#00ADD8'; break;
        default: color = '#cccccc';
    }

    return <File size={16} stroke={color} strokeWidth={1.5} />;
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
    const [isExpanded, setIsExpanded] = useState(false); // Default collapsed for files, verify logic below
    const { openFile, activeFileId } = useEditorStore();
    const { readFile } = useFileSystem();

    // Auto expand folders if depth 0? No, let's keep it manual like VS Code

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

    const paddingLeft = depth * 10 + 10; // 10px indentation step + base padding

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
                {/* Indent content */}
                <div className="flex items-center gap-1.5 w-full">
                    {/* Twistie / Chevron */}
                    <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center opacity-80">
                        {node.type === 'folder' && (
                            isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                        )}
                    </span>

                    {/* Icon */}
                    <span className="flex-shrink-0">
                        <FileIcon name={node.name} isFolder={node.type === 'folder'} isOpen={isExpanded} />
                    </span>

                    {/* Label */}
                    <span className="truncate">{node.name}</span>
                </div>
            </div>

            {/* Children */}
            {node.type === 'folder' && isExpanded && node.children?.map(child => (
                <TreeItem key={child.id} node={child} depth={depth + 1} />
            ))}
        </>
    );
};

export const FileExplorer: React.FC = () => {
    const [files, setFiles] = useState<FileNode[]>([]);
    const { readDir } = useFileSystem();

    const loadFiles = useCallback(async () => {
        const tree = await readDir('/');
        setFiles(tree);
    }, [readDir]);

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
