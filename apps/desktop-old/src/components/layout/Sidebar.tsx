import React, { useState } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useFileSystem } from '../../hooks/useFileSystem';
import { FileExplorer } from '../fileexplorer/FileExplorer';
import { Search, ChevronDown, MoreHorizontal, RefreshCw, Plus, ChevronsDownUp, AlertCircle, FolderOpen } from 'lucide-react';

// Reusable Section Header Component
interface SectionProps {
    title: string;
    children: React.ReactNode;
    defaultExpanded?: boolean;
}

const Section: React.FC<SectionProps> = ({ title, children, defaultExpanded = true }) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const sectionId = `section-${title.replace(/\s+/g, '-').toLowerCase()}`;
    const headerId = `${sectionId}-header`;

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
        }
    };

    return (
        <div className="flex flex-col">
            <div
                id={headerId}
                role="button"
                aria-expanded={isExpanded}
                aria-controls={sectionId}
                tabIndex={0}
                className="sidebar-section-header"
                onClick={() => setIsExpanded(!isExpanded)}
                onKeyDown={handleKeyDown}
            >
                <span
                    className="sidebar-section-icon"
                    style={{
                        transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                    }}
                >
                    <ChevronDown size={14} strokeWidth={2} />
                </span>
                <span className="truncate">{title}</span>
            </div>
            <div
                id={sectionId}
                role="region"
                aria-labelledby={headerId}
                style={{
                    overflow: 'hidden',
                    maxHeight: isExpanded ? '2000px' : '0',
                    opacity: isExpanded ? 1 : 0,
                    transition: 'max-height 0.2s ease-out, opacity 0.15s ease',
                }}
            >
                {children}
            </div>
        </div>
    );
};

// Empty State Component
const EmptyState: React.FC<{ message: string }> = ({ message }) => (
    <div className="px-6 py-3 cursor-default select-none text-[12px] flex items-center gap-2"
        style={{ color: '#565f89', fontStyle: 'italic' }}>
        <AlertCircle size={12} style={{ opacity: 0.5 }} />
        {message}
    </div>
);

// Sidebar action button
const SidebarAction: React.FC<{
    icon: React.ReactNode;
    title: string;
    onClick?: () => void;
}> = ({ icon, title, onClick }) => (
    <button
        onClick={onClick}
        aria-label={title}
        className="p-1.5 rounded transition-all cursor-pointer border-none bg-transparent"
        style={{ color: '#565f89' }}
        onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(122, 162, 247, 0.1)';
            e.currentTarget.style.color = '#c0caf5';
        }}
        onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#565f89';
        }}
        title={title}
    >
        {icon}
    </button>
);

export const Sidebar: React.FC = () => {
    const { sidebarView, isSidebarOpen, currentFolderPath, setCurrentFolder } = useUIStore();
    const { openFolderDialog } = useFileSystem();
    const [refreshKey, setRefreshKey] = useState(0);

    const handleOpenFolder = async () => {
        const folderPath = await openFolderDialog();
        if (folderPath) {
            setCurrentFolder(folderPath);
            setRefreshKey(k => k + 1);
        }
    };

    const handleRefresh = () => {
        setRefreshKey(k => k + 1);
    };

    if (!isSidebarOpen) return null;

    // Get folder name from path
    const folderName = currentFolderPath
        ? currentFolderPath.split(/[/\\]/).pop() || 'Project'
        : 'CodeNative';

    return (
        <div className="sidebar animate-fade-in">
            {/* Sidebar Title Area */}
            <div className="sidebar-title group justify-between">
                <span className="truncate" style={{
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontWeight: 600,
                    color: '#7aa2f7',
                }}>
                    {sidebarView === 'files' ? 'Explorer' : 'Search'}
                </span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <SidebarAction icon={<FolderOpen size={14} strokeWidth={1.5} />} title="Open Folder" onClick={handleOpenFolder} />
                    <SidebarAction icon={<Plus size={14} strokeWidth={1.5} />} title="New File" />
                    <SidebarAction icon={<RefreshCw size={14} strokeWidth={1.5} />} title="Refresh" onClick={handleRefresh} />
                    <SidebarAction icon={<ChevronsDownUp size={14} strokeWidth={1.5} />} title="Collapse All" />
                    <SidebarAction icon={<MoreHorizontal size={14} strokeWidth={1.5} />} title="More Actions" />
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
                {sidebarView === 'files' && (
                    <>
                        <Section title="Open Editors" defaultExpanded={false}>
                            <EmptyState message="No open editors" />
                        </Section>

                        <Section title={folderName}>
                            <FileExplorer key={refreshKey} folderPath={currentFolderPath} />
                        </Section>

                        <Section title="Outline" defaultExpanded={false}>
                            <EmptyState message="No symbols found" />
                        </Section>

                        <Section title="Timeline" defaultExpanded={false}>
                            <EmptyState message="No timeline available" />
                        </Section>
                    </>
                )}
                {sidebarView === 'search' && <SearchPanel />}
            </div>
        </div>
    );
};

const SearchPanel: React.FC = () => {
    const [searchQuery, setSearchQuery] = useState('');

    return (
        <div className="p-3 text-sm">
            <div className="relative mb-3">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: '#565f89' }} />
                <input
                    type="text"
                    placeholder="Search"
                    aria-label="Search files"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-2 py-2 outline-none rounded text-[13px]"
                    style={{
                        backgroundColor: '#1a1b26',
                        border: '1px solid #292e42',
                        color: '#c0caf5',
                        transition: 'border-color 0.15s ease',
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#7aa2f7'}
                    onBlur={(e) => e.target.style.borderColor = '#292e42'}
                />
            </div>

            <div className="relative mb-3">
                <input
                    type="text"
                    placeholder="Replace"
                    aria-label="Replace text"
                    className="w-full px-2 py-2 outline-none rounded text-[13px]"
                    style={{
                        backgroundColor: '#1a1b26',
                        border: '1px solid #292e42',
                        color: '#c0caf5',
                        transition: 'border-color 0.15s ease',
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#7aa2f7'}
                    onBlur={(e) => e.target.style.borderColor = '#292e42'}
                />
            </div>

            <div className="text-center mt-8 text-[12px] leading-relaxed" style={{ color: '#565f89' }}>
                {searchQuery ? (
                    <p>No results found for "{searchQuery}"</p>
                ) : (
                    <p>Type to search across all files</p>
                )}
            </div>
        </div>
    );
};
