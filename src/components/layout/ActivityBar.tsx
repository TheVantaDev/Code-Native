import React from 'react';
import { Files, Search, GitBranch, Bug, Package, Settings, Bot, Sparkles } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

interface ActivityItemProps {
    icon: React.ReactNode;
    isActive: boolean;
    onClick: () => void;
    badge?: number;
    label: string;
    showDot?: 'green' | 'red' | 'yellow';
}

const ActivityItem: React.FC<ActivityItemProps> = ({
    icon,
    isActive,
    onClick,
    badge,
    label,
    showDot
}) => {
    return (
        <div
            role="tab"
            aria-label={label}
            aria-selected={isActive}
            onClick={onClick}
            className={`activity-item ${isActive ? 'active' : ''}`}
            title={label}
        >
            {icon}
            {badge && badge > 0 && (
                <div className="activity-badge">{badge}</div>
            )}
            {showDot && (
                <div
                    className={`absolute bottom-2 right-2 w-2 h-2 rounded-full ${showDot === 'green' ? 'bg-green-400' :
                            showDot === 'red' ? 'bg-red-400' :
                                'bg-yellow-400 animate-pulse'
                        }`}
                />
            )}
        </div>
    );
};

export const ActivityBar: React.FC = () => {
    const { sidebarView, setSidebarView, toggleAIPanel, isAIPanelOpen } = useUIStore();

    return (
        <div className="activity-bar">
            {/* Top Icons */}
            <div className="flex flex-col">
                <ActivityItem
                    icon={<Files size={24} strokeWidth={1.5} />}
                    isActive={sidebarView === 'files'}
                    onClick={() => setSidebarView('files')}
                    label="Explorer (Ctrl+Shift+E)"
                />
                <ActivityItem
                    icon={<Search size={24} strokeWidth={1.5} />}
                    isActive={sidebarView === 'search'}
                    onClick={() => setSidebarView('search')}
                    label="Search (Ctrl+Shift+F)"
                />
                <ActivityItem
                    icon={<GitBranch size={24} strokeWidth={1.5} />}
                    isActive={false}
                    onClick={() => { }}
                    label="Source Control"
                    badge={2}
                />
                <ActivityItem
                    icon={<Bug size={24} strokeWidth={1.5} />}
                    isActive={false}
                    onClick={() => { }}
                    label="Run and Debug"
                />
                <ActivityItem
                    icon={<Package size={24} strokeWidth={1.5} />}
                    isActive={false}
                    onClick={() => { }}
                    label="Extensions"
                />
            </div>

            {/* Bottom Icons */}
            <div className="flex flex-col pb-2">
                <ActivityItem
                    icon={
                        <div className="relative">
                            <Sparkles size={24} strokeWidth={1.5} className={isAIPanelOpen ? 'text-[#007acc]' : ''} />
                        </div>
                    }
                    isActive={isAIPanelOpen}
                    onClick={toggleAIPanel}
                    label="AI Assistant (Ctrl+Shift+I)"
                />
                <ActivityItem
                    icon={<Settings size={24} strokeWidth={1.5} />}
                    isActive={false}
                    onClick={() => { }}
                    label="Manage"
                />
            </div>
        </div>
    );
};
