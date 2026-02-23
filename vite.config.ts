import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/feed': {
        target: 'https://threatmap-api.checkpoint.com',
        changeOrigin: true,
        rewrite: (path) => `/ThreatMap${path}`,
        secure: true,
      },
    },
  },
})
