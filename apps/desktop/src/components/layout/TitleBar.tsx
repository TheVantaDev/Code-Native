import React, { useState } from 'react';
import { Minus, Square, X, Code2, ChevronDown } from 'lucide-react';

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

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                onBlur={() => setTimeout(() => setIsOpen(false), 150)}
                className="px-2.5 py-1 text-[12px] hover:bg-[rgba(255,255,255,0.1)] rounded transition-colors cursor-pointer bg-transparent border-none text-[var(--vscode-titleBar-activeFg)]"
            >
                {label}
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-0.5 w-56 bg-[#252526] border border-[#454545] rounded shadow-xl z-50">
                    {items.map((item, idx) => (
                        item.divider ? (
                            <div key={idx} className="h-px bg-[#454545] my-1" />
                        ) : (
                            <button
                                key={idx}
                                onClick={() => {
                                    item.action?.();
                                    setIsOpen(false);
                                }}
                                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] text-[var(--vscode-fg)] hover:bg-[#094771] transition-colors cursor-pointer bg-transparent border-none text-left"
                            >
                                <span>{item.label}</span>
                                {item.shortcut && (
                                    <span className="text-[11px] opacity-60">{item.shortcut}</span>
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
        <div className="flex items-center h-full -webkit-app-region-no-drag">
            <button
                onClick={handleMinimize}
                className="w-[46px] h-full flex items-center justify-center hover:bg-[rgba(255,255,255,0.1)] transition-colors cursor-pointer bg-transparent border-none text-[var(--vscode-titleBar-activeFg)]"
                title="Minimize"
            >
                <Minus size={16} />
            </button>
            <button
                onClick={handleMaximize}
                className="w-[46px] h-full flex items-center justify-center hover:bg-[rgba(255,255,255,0.1)] transition-colors cursor-pointer bg-transparent border-none text-[var(--vscode-titleBar-activeFg)]"
                title="Maximize"
            >
                <Square size={12} />
            </button>
            <button
                onClick={handleClose}
                className="w-[46px] h-full flex items-center justify-center hover:bg-[#c42b1c] transition-colors cursor-pointer bg-transparent border-none text-[var(--vscode-titleBar-activeFg)]"
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
            className="h-[30px] flex items-center justify-between bg-[#3c3c3c] border-b border-[#2b2b2b] select-none"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
            {/* Left: App Icon + Menus */}
            <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                {/* App Icon */}
                <div className="w-[46px] h-full flex items-center justify-center">
                    <Code2 size={18} className="text-[#007acc]" />
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
            <div className="absolute left-1/2 -translate-x-1/2 text-[12px] text-[var(--vscode-titleBar-activeFg)] font-normal flex items-center gap-2">
                <span className="opacity-60">CodeNative</span>
                <span className="opacity-40">-</span>
                <span>Welcome</span>
            </div>

            {/* Right: Window Controls */}
            <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                <WindowControls />
            </div>
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
