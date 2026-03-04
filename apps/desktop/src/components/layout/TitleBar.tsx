import React, { useState, useRef, useEffect } from 'react';
import { Minus, Square, X, Code2 } from 'lucide-react';

// Menu item type
interface MenuItem {
    label: string;
    shortcut?: string;
    action?: () => void;
    divider?: boolean;
}

interface MenuProps {
    label: string;
    items: MenuItem[];
}

const Menu: React.FC<MenuProps> = ({ label, items }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="px-2.5 py-1 text-[12px] rounded transition-all cursor-pointer bg-transparent border-none"
                style={{
                    color: isOpen ? '#c0caf5' : '#a9b1d6',
                    backgroundColor: isOpen ? 'rgba(122, 162, 247, 0.1)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                    if (!isOpen) (e.target as HTMLElement).style.backgroundColor = 'rgba(122, 162, 247, 0.06)';
                }}
                onMouseLeave={(e) => {
                    if (!isOpen) (e.target as HTMLElement).style.backgroundColor = 'transparent';
                }}
            >
                {label}
            </button>

            {isOpen && (
                <div className="dropdown-menu absolute top-full left-0 mt-1 w-60 z-50 py-1">
                    {items.map((item, idx) => (
                        item.divider ? (
                            <div key={idx} className="h-px bg-[#292e42] my-1 mx-2" />
                        ) : (
                            <button
                                key={idx}
                                onClick={() => {
                                    item.action?.();
                                    setIsOpen(false);
                                }}
                                className="dropdown-item w-full flex items-center justify-between px-3 py-[6px] text-[12px] cursor-pointer bg-transparent border-none text-left rounded-none"
                                style={{ color: '#a9b1d6' }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = '#c0caf5')}
                                onMouseLeave={(e) => (e.currentTarget.style.color = '#a9b1d6')}
                            >
                                <span>{item.label}</span>
                                {item.shortcut && (
                                    <span className="text-[11px]" style={{ color: '#565f89' }}>{item.shortcut}</span>
                                )}
                            </button>
                        )
                    ))}
                </div>
            )}
        </div>
    );
};

// Window controls for Electron
const WindowControls: React.FC = () => {
    const handleMinimize = () => {
        if (window.electron?.minimize) {
            window.electron.minimize();
        }
    };

    const handleMaximize = () => {
        if (window.electron?.maximize) {
            window.electron.maximize();
        }
    };

    const handleClose = () => {
        if (window.electron?.close) {
            window.electron.close();
        }
    };

    return (
        <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
                onClick={handleMinimize}
                className="w-[46px] h-full flex items-center justify-center transition-colors cursor-pointer bg-transparent border-none"
                style={{ color: '#565f89' }}
                onMouseEnter={(e) => {
                    (e.currentTarget.style.backgroundColor = 'rgba(122, 162, 247, 0.1)');
                    (e.currentTarget.style.color = '#c0caf5');
                }}
                onMouseLeave={(e) => {
                    (e.currentTarget.style.backgroundColor = 'transparent');
                    (e.currentTarget.style.color = '#565f89');
                }}
                title="Minimize"
            >
                <Minus size={16} />
            </button>
            <button
                onClick={handleMaximize}
                className="w-[46px] h-full flex items-center justify-center transition-colors cursor-pointer bg-transparent border-none"
                style={{ color: '#565f89' }}
                onMouseEnter={(e) => {
                    (e.currentTarget.style.backgroundColor = 'rgba(122, 162, 247, 0.1)');
                    (e.currentTarget.style.color = '#c0caf5');
                }}
                onMouseLeave={(e) => {
                    (e.currentTarget.style.backgroundColor = 'transparent');
                    (e.currentTarget.style.color = '#565f89');
                }}
                title="Maximize"
            >
                <Square size={12} />
            </button>
            <button
                onClick={handleClose}
                className="w-[46px] h-full flex items-center justify-center transition-colors cursor-pointer bg-transparent border-none"
                style={{ color: '#565f89' }}
                onMouseEnter={(e) => {
                    (e.currentTarget.style.backgroundColor = 'rgba(247, 118, 142, 0.15)');
                    (e.currentTarget.style.color = '#f7768e');
                }}
                onMouseLeave={(e) => {
                    (e.currentTarget.style.backgroundColor = 'transparent');
                    (e.currentTarget.style.color = '#565f89');
                }}
                title="Close"
            >
                <X size={16} />
            </button>
        </div>
    );
};

export const TitleBar: React.FC = () => {
    const fileMenuItems: MenuItem[] = [
        { label: 'New File', shortcut: 'Ctrl+N' },
        { label: 'New Window', shortcut: 'Ctrl+Shift+N' },
        { divider: true },
        { label: 'Open File...', shortcut: 'Ctrl+O' },
        { label: 'Open Folder...', shortcut: 'Ctrl+K Ctrl+O' },
        { divider: true },
        { label: 'Save', shortcut: 'Ctrl+S' },
        { label: 'Save As...', shortcut: 'Ctrl+Shift+S' },
        { divider: true },
        { label: 'Exit', shortcut: 'Alt+F4' },
    ];

    const editMenuItems: MenuItem[] = [
        { label: 'Undo', shortcut: 'Ctrl+Z' },
        { label: 'Redo', shortcut: 'Ctrl+Y' },
        { divider: true },
        { label: 'Cut', shortcut: 'Ctrl+X' },
        { label: 'Copy', shortcut: 'Ctrl+C' },
        { label: 'Paste', shortcut: 'Ctrl+V' },
        { divider: true },
        { label: 'Find', shortcut: 'Ctrl+F' },
        { label: 'Replace', shortcut: 'Ctrl+H' },
    ];

    const viewMenuItems: MenuItem[] = [
        { label: 'Command Palette...', shortcut: 'Ctrl+Shift+P' },
        { label: 'Open View...', shortcut: 'Ctrl+Q' },
        { divider: true },
        { label: 'Explorer', shortcut: 'Ctrl+Shift+E' },
        { label: 'Search', shortcut: 'Ctrl+Shift+F' },
        { label: 'AI Assistant', shortcut: 'Ctrl+Shift+I' },
        { divider: true },
        { label: 'Toggle Full Screen', shortcut: 'F11' },
        { label: 'Zen Mode', shortcut: 'Ctrl+K Z' },
    ];

    const helpMenuItems: MenuItem[] = [
        { label: 'Welcome' },
        { label: 'Documentation' },
        { divider: true },
        { label: 'About' },
    ];

    return (
        <div
            className="h-[32px] flex items-center justify-between select-none"
            style={{
                WebkitAppRegion: 'drag',
                backgroundColor: '#16171f',
                borderBottom: '1px solid #292e42',
            } as React.CSSProperties}
        >
            {/* Left: App Icon + Menus */}
            <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                {/* App Icon */}
                <div className="w-[46px] h-full flex items-center justify-center">
                    <div className="w-5 h-5 rounded flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #7aa2f7, #bb9af7)' }}>
                        <Code2 size={12} className="text-white" strokeWidth={2.5} />
                    </div>
                </div>

                {/* Menus */}
                <div className="flex items-center gap-0.5">
                    <Menu label="File" items={fileMenuItems} />
                    <Menu label="Edit" items={editMenuItems} />
                    <Menu label="View" items={viewMenuItems} />
                    <Menu label="Help" items={helpMenuItems} />
                </div>
            </div>

            {/* Center: Title */}
            <div className="absolute left-1/2 -translate-x-1/2 text-[12px] font-normal flex items-center gap-2"
                style={{ color: '#565f89' }}>
                <span style={{ color: '#7aa2f7', fontWeight: 500 }}>CodeNative</span>
                <span style={{ opacity: 0.3 }}>—</span>
                <span>Welcome</span>
            </div>

            {/* Right: Window Controls */}
            <WindowControls />
        </div>
    );
};

// Add type declaration for electron API
declare global {
    interface Window {
        electron?: {
            minimize: () => void;
            maximize: () => void;
            close: () => void;
        };
    }
}
