/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // VS Code-like dark theme colors
        'editor-bg': '#1e1e1e',
        'sidebar-bg': '#252526',
        'activitybar-bg': '#333333',
        'titlebar-bg': '#3c3c3c',
        'border': '#3c3c3c',
        'text-primary': '#cccccc',
        'text-secondary': '#858585',
        'text-muted': '#6e6e6e',
        'accent': '#0e639c',
        'accent-hover': '#1177bb',
        'tab-active': '#1e1e1e',
        'tab-inactive': '#2d2d2d',
        'selection': '#264f78',
        'hover': '#2a2d2e',
      },
      fontFamily: {
        'mono': ['Consolas', 'Monaco', 'Courier New', 'monospace'],
        'sans': ['Segoe UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
