import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// Served from https://devzonayed.github.io/blindqa/ — assets land in docs/assets/site/.
export default defineConfig({
  base: '/blindqa/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: 'dist/client', assetsDir: 'assets/site', emptyOutDir: true },
})
