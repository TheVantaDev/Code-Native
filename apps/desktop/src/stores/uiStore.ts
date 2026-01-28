import { create } from 'zustand';
import { SidebarView } from '../types';

interface UIState {
    sidebarView: SidebarView;
    isAIPanelOpen: boolean;
    isSidebarOpen: boolean;
    isTerminalOpen: boolean;
    currentFolderPath: string | null;

    // Actions
    setSidebarView: (view: SidebarView) => void;
    toggleAIPanel: () => void;
    toggleSidebar: () => void;
    toggleTerminal: () => void;
    setCurrentFolder: (path: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
    sidebarView: 'files',
    isAIPanelOpen: true,
    isSidebarOpen: true,
    isTerminalOpen: false,
    currentFolderPath: null,

    setSidebarView: (view) => set({ sidebarView: view, isSidebarOpen: true }),

    toggleAIPanel: () => set((state) => ({ isAIPanelOpen: !state.isAIPanelOpen })),

    toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

    toggleTerminal: () => set((state) => ({ isTerminalOpen: !state.isTerminalOpen })),

    setCurrentFolder: (path) => set({ currentFolderPath: path }),
}));
