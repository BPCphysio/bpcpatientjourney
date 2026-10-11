import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The new trainer is built into ../v2 and served beside the current site at
// /v2 until it replaces it. It talks to the same clinic API (/api/clinic).
export default defineConfig({
  base: '/v2/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: { outDir: '../v2', emptyOutDir: true },
  // local preview: the live clinic API, or a test copy (API_TARGET=http://localhost:8125)
  server: {
    proxy: {
      '/api': { target: process.env.API_TARGET || 'https://bpcpatientjourney.vercel.app', changeOrigin: true },
      '/grading': { target: process.env.API_TARGET || 'https://bpcpatientjourney.vercel.app', changeOrigin: true }
    }
  }
})
