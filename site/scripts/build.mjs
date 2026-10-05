/**
 * Build the landing page into ../docs/ for GitHub Pages:
 *   1. client bundle (vite build)            → dist/client/
 *   2. server bundle (vite build --ssr)      → dist/server/
 *   3. render <App/> to HTML, inject it plus structured data into index.html → ../docs/index.html
 *   4. copy the hashed assets                → ../docs/assets/site/
 * The page is real HTML before any script runs (crawlers, link previews, no-JS readers); the client
 * bundle then hydrates it for the animations and buttons. The markdown docs in ../docs stay with Jekyll.
 */
import { build } from 'vite'
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const docs = join(root, '..', 'docs')

await build({ root, logLevel: 'warn' })
await build({ root, logLevel: 'warn', build: { ssr: 'src/entry-server.tsx', outDir: 'dist/server', emptyOutDir: true } })

const { render, faq } = await import(pathToFileURL(join(root, 'dist/server/entry-server.js')).href)
const appHtml = render()

const ld = [
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'blindqa',
    description: 'Human-like QA testing for any web app — a Claude Code and Codex plugin, MCP server and CLI that drives a real browser like a person and re-tests only what your code changes touch.',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Linux, Windows',
    url: 'https://devzonayed.github.io/blindqa/',
    downloadUrl: 'https://github.com/DevZonayed/blindqa',
    softwareVersion: JSON.parse(readFileSync(join(root, '..', 'package.json'), 'utf8')).version,
    license: 'https://opensource.org/licenses/MIT',
    author: { '@type': 'Person', name: 'Jonayed Ahamed', url: 'https://github.com/DevZonayed' },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    image: 'https://devzonayed.github.io/blindqa/assets/social-preview.png',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  },
]
const structured = ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`).join('\n    ')

const template = readFileSync(join(root, 'dist/client/index.html'), 'utf8')
if (!template.includes('<!--app-html-->') || !template.includes('<!--structured-data-->')) throw new Error('index.html placeholders missing')
const html = template.replace('<!--app-html-->', appHtml).replace('<!--structured-data-->', structured)

rmSync(join(docs, 'assets/site'), { recursive: true, force: true })
cpSync(join(root, 'dist/client/assets/site'), join(docs, 'assets/site'), { recursive: true })
writeFileSync(join(docs, 'index.html'), html)
if (existsSync(join(docs, 'index.md'))) rmSync(join(docs, 'index.md')) // the old Jekyll home page
console.log(`docs/index.html: ${Math.round(html.length / 1024)} KB of HTML (${Math.round(appHtml.length / 1024)} KB pre-rendered), assets in docs/assets/site/`)
