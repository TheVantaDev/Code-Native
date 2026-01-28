import { create } from 'zustand';
import { SidebarView } from '../types';

interface UIState {
    sidebarView: SidebarView;
    isAIPanelOpen: boolean;
    isSidebarOpen: boolean;
    isTerminalOpen: boolean;

    // Actions
    setSidebarView: (view: SidebarView) => void;
    toggleAIPanel: () => void;
    toggleSidebar: () => void;
    toggleTerminal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
    sidebarView: 'files',
    isAIPanelOpen: true,
    isSidebarOpen: true,
    isTerminalOpen: false,

    setSidebarView: (view) => set({ sidebarView: view, isSidebarOpen: true }),

    toggleAIPanel: () => set((state) => ({ isAIPanelOpen: !state.isAIPanelOpen })),

    toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

    toggleTerminal: () => set((state) => ({ isTerminalOpen: !state.isTerminalOpen })),
}));
