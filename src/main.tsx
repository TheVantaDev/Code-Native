import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Use contextBridge - only if available (Electron mode)
if (typeof window !== 'undefined' && (window as any).ipcRenderer) {
  (window as any).ipcRenderer.on('main-process-message', (_event: any, message: any) => {
    console.log(message)
  })
}
