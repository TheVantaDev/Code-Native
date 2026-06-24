import React, { useState } from 'react';
import { Files, Search, GitBranch, Bug, Package, Settings, Sparkles } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

interface ActivityItemProps {
    icon: React.ReactNode;
    isActive: boolean;
    onClick: () => void;
    badge?: number;
    label: string;
    showDot?: 'green' | 'red' | 'yellow';
    glowing?: boolean;
}

const ActivityItem: React.FC<ActivityItemProps> = ({
    icon,
    isActive,
    onClick,
    badge,
    label,
    showDot,
    glowing
}) => {
    const [isHovered, setIsHovered] = useState(false);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
        }
    };

    return (
        <div className="tooltip-wrapper">
            <div
                role="tab"
                aria-label={label}
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={onClick}
                onKeyDown={handleKeyDown}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className={`activity-item ${isActive ? 'active' : ''} ${glowing ? 'animate-glow' : ''}`}
            >
                {icon}
                {badge && badge > 0 && (
                    <div className="activity-badge">{badge}</div>
                )}
                {showDot && (
                    <div
                        className="absolute bottom-2 right-2 w-2 h-2 rounded-full"
                        style={{
                            backgroundColor: showDot === 'green' ? '#9ece6a' :
                                showDot === 'red' ? '#f7768e' : '#e0af68',
                            animation: showDot === 'yellow' ? 'pulse 2s ease-in-out infinite' : 'none',
                            boxShadow: `0 0 6px ${showDot === 'green' ? 'rgba(158, 206, 106, 0.4)' :
                                showDot === 'red' ? 'rgba(247, 118, 142, 0.4)' :
                                    'rgba(224, 175, 104, 0.4)'}`
                        }}
                    />
                )}
            </div>
            {/* Tooltip */}
            <div className="tooltip-content">
                {label}
            </div>
        </div>
    );
};

export const ActivityBar: React.FC = () => {
    const { sidebarView, setSidebarView, toggleAIPanel, isAIPanelOpen } = useUIStore();

    return (
        <div className="activity-bar">
            {/* Top Icons */}
            <div className="flex flex-col" role="tablist" aria-label="Primary actions">
                <ActivityItem
                    icon={<Files size={22} strokeWidth={1.5} />}
                    isActive={sidebarView === 'files'}
                    onClick={() => setSidebarView('files')}
                    label="Explorer"
                />
                <ActivityItem
                    icon={<Search size={22} strokeWidth={1.5} />}
                    isActive={sidebarView === 'search'}
                    onClick={() => setSidebarView('search')}
                    label="Search"
                />
                <ActivityItem
                    icon={<GitBranch size={22} strokeWidth={1.5} />}
                    isActive={false}
                    onClick={() => { }}
                    label="Source Control"
                    badge={2}
                />
                <ActivityItem
                    icon={<Bug size={22} strokeWidth={1.5} />}
                    isActive={false}
                    onClick={() => { }}
                    label="Run and Debug"
                />
                <ActivityItem
                    icon={<Package size={22} strokeWidth={1.5} />}
                    isActive={false}
                    onClick={() => { }}
                    label="Extensions"
                />
            </div>

            {/* Divider */}
            <div className="flex-1" />

            {/* Bottom Icons */}
            <div className="flex flex-col pb-2" role="tablist" aria-label="Secondary actions">
                <ActivityItem
                    icon={
                        <Sparkles
                            size={22}
                            strokeWidth={1.5}
                            style={{
                                color: isAIPanelOpen ? '#7aa2f7' : undefined,
                            }}
                        />
                    }
                    isActive={isAIPanelOpen}
                    onClick={toggleAIPanel}
                    label="AI Assistant"
                    glowing={isAIPanelOpen}
                />
                <ActivityItem
                    icon={<Settings size={22} strokeWidth={1.5} />}
                    isActive={false}
                    onClick={() => { }}
                    label="Settings"
                />
            </div>
        </div>
    );
};
