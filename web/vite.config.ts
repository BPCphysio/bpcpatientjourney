import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The trainer is built into ../trainer and served at /trainer; the address
// "/" sends people there (vercel.json). It talks to the clinic API (/api/clinic).
export default defineConfig({
  base: '/trainer/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: { outDir: '../trainer', emptyOutDir: true },
  // local preview: the live clinic API, or a test copy (API_TARGET=http://localhost:8125)
  server: {
    proxy: {
      '/api': { target: process.env.API_TARGET || 'https://bpcpatientjourney.vercel.app', changeOrigin: true },
      '/grading': { target: process.env.API_TARGET || 'https://bpcpatientjourney.vercel.app', changeOrigin: true }
    }
  }
})
