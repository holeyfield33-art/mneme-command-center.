import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/auth': 'http://api:8000',
      '/projects': 'http://api:8000',
      '/tasks': 'http://api:8000',
      '/approvals': 'http://api:8000',
      '/worker': 'http://api:8000',
      '/system': 'http://api:8000',
      '/api/v1': 'http://api:8000',
      '/events': 'http://api:8000',
    },
  },
})
