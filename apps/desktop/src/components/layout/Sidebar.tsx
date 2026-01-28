import React, { useState } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { FileExplorer } from '../fileexplorer/FileExplorer';
import { Search, ChevronDown, MoreHorizontal, RefreshCw, Plus, ChevronsDownUp, AlertCircle } from 'lucide-react';

// Reusable Section Header Component
interface SectionProps {
    title: string;
    children: React.ReactNode;
    defaultExpanded?: boolean;
}

const Section: React.FC<SectionProps> = ({ title, children, defaultExpanded = true }) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    return (
        <div className="flex flex-col">
            <div
                className="sidebar-section-header"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className={`sidebar-section-icon ${isExpanded ? '' : '-rotate-90'}`} style={{ transition: 'transform 0.15s ease' }}>
                    <ChevronDown size={14} strokeWidth={2} />
                </span>
                <span className="truncate">{title}</span>
            </div>
            <div
                className={`overflow-hidden transition-all duration-150 ease-out ${isExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}
            >
                {children}
            </div>
        </div>
    );
};

// Sidebar Header Actions (Icons)
const SidebarActions: React.FC = () => (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {[
            { Icon: Plus, title: 'New File' },
            { Icon: RefreshCw, title: 'Refresh' },
            { Icon: ChevronsDownUp, title: 'Collapse All' },
            { Icon: MoreHorizontal, title: 'More Actions' },
        ].map(({ Icon, title }, i) => (
            <button
                key={i}
                className="p-1.5 rounded hover:bg-[rgba(255,255,255,0.1)] transition-colors cursor-pointer border-none bg-transparent text-[var(--vscode-sideBarTitle-fg)]"
                title={title}
            >
                <Icon size={14} strokeWidth={1.5} />
            </button>
        ))}
    </div>
);

// Empty State Component
const EmptyState: React.FC<{ message: string }> = ({ message }) => (
    <div className="px-6 py-2 italic opacity-50 cursor-default select-none text-[12px] flex items-center gap-2">
        <AlertCircle size={12} className="opacity-60" />
        {message}
    </div>
);

export const Sidebar: React.FC = () => {
    const { sidebarView, isSidebarOpen } = useUIStore();

    if (!isSidebarOpen) return null;

    return (
        <div className="sidebar">
            {/* Sidebar Title Area */}
            <div className="sidebar-title group justify-between">
                <span className="truncate" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {sidebarView === 'files' ? 'Explorer' : 'Search'}
                </span>
                <SidebarActions />
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
                {sidebarView === 'files' && (
                    <>
                        <Section title="Open Editors" defaultExpanded={false}>
                            <EmptyState message="No open editors" />
                        </Section>

                        <Section title="CodeNative">
                            <FileExplorer />
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
        <div className="p-3 text-[var(--vscode-fg)] text-sm">
            <div className="relative mb-3">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" />
                <input
                    type="text"
                    placeholder="Search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-2 py-1.5 outline-none border border-[var(--vscode-input-border)] bg-[var(--vscode-input-bg)] text-[var(--vscode-input-fg)] rounded focus:border-[var(--vscode-focusBorder)] placeholder:text-[var(--vscode-input-placeholderFg)] text-[13px]"
                />
            </div>

            <div className="flex gap-2 mb-3">
                <input
                    type="text"
                    placeholder="Replace"
                    className="flex-1 px-2 py-1.5 outline-none border border-[var(--vscode-input-border)] bg-[var(--vscode-input-bg)] text-[var(--vscode-input-fg)] rounded focus:border-[var(--vscode-focusBorder)] placeholder:text-[var(--vscode-input-placeholderFg)] text-[13px]"
                />
            </div>

            <div className="text-center opacity-50 mt-6 text-[12px] leading-relaxed">
                {searchQuery ? (
                    <p>No results found for "{searchQuery}"</p>
                ) : (
                    <p>Type to search across all files</p>
                )}
            </div>
        </div>
    );
};
