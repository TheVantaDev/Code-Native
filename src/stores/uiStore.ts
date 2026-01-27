import { create } from 'zustand';
import { SidebarView } from '../types';

interface UIState {
    sidebarView: SidebarView;
    isAIPanelOpen: boolean;
    isSidebarOpen: boolean;

    // Actions
    setSidebarView: (view: SidebarView) => void;
    toggleAIPanel: () => void;
    toggleSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
    sidebarView: 'files',
    isAIPanelOpen: true,
    isSidebarOpen: true,

    setSidebarView: (view) => set({ sidebarView: view, isSidebarOpen: true }),

    toggleAIPanel: () => set((state) => ({ isAIPanelOpen: !state.isAIPanelOpen })),

    toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
}));
