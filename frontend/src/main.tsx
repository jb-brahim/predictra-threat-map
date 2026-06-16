// ─── REACT APPLICATION ENTRY POINT ───────────────────────────────────────────
// This file initializes the React application, mounts it to the DOM root element,
// and runs the app under React's StrictMode to catch potential bugs early.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
