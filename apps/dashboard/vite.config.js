import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/auth': 'http://127.0.0.1:8000',
      '/projects': 'http://127.0.0.1:8000',
      '/tasks': 'http://127.0.0.1:8000',
      '/approvals': 'http://127.0.0.1:8000',
      '/worker': 'http://127.0.0.1:8000',
      '/system': 'http://127.0.0.1:8000',
      '/api/v1': 'http://127.0.0.1:8000',
      '/events': 'http://127.0.0.1:8000',
    },
  },
})
