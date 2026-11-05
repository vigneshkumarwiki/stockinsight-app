import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/upstox-api': {
        target: 'https://api.upstox.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/upstox-api/, ''),
        secure: true,
      },
      '/api/upstox': {
        target: 'https://api.upstox.com/v2',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/upstox/, ''),
        secure: true,
      },
    },
  },
})
