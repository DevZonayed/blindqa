import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

// Served from https://devzonayed.github.io/blindqa/ — assets land in docs/assets/site/.
export default defineConfig({
  base: '/blindqa/',
  plugins: [react(), tailwindcss()],
  define: { __BLINDQA_VERSION__: JSON.stringify(version) }, // the release shown in the hero
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: 'dist/client', assetsDir: 'assets/site', emptyOutDir: true },
})
