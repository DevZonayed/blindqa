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

const SITE = 'https://devzonayed.github.io/blindqa/'
const REPO = 'https://github.com/DevZonayed/blindqa'
const version = JSON.parse(readFileSync(join(root, '..', 'package.json'), 'utf8')).version
const author = { '@type': 'Person', '@id': `${SITE}#author`, name: 'Jonayed Ahamed', url: 'https://github.com/DevZonayed' }
const ld = [
  {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${SITE}#website`, url: SITE, name: 'blindqa', inLanguage: 'en', publisher: { '@id': `${SITE}#author` } },
      author,
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE}#app`,
        name: 'blindqa',
        alternateName: 'blindqa QA plugin',
        description: 'Human-like QA testing for any web app: an open-source Claude Code and Codex plugin, MCP server and CLI. Playwright drives a real browser like a person, finds visual, accessibility, permission and workflow bugs, and re-tests only what your code changes touch, with no AI model in the test loop.',
        applicationCategory: 'DeveloperApplication',
        applicationSubCategory: 'Software testing',
        operatingSystem: 'macOS, Linux, Windows',
        softwareRequirements: 'Node.js 20 or later, git',
        url: SITE,
        downloadUrl: REPO,
        installUrl: `${SITE}INSTALL.html`,
        softwareVersion: version,
        license: 'https://opensource.org/licenses/MIT',
        isAccessibleForFree: true,
        author: { '@id': `${SITE}#author` },
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        image: `${SITE}assets/social-preview.png`,
        screenshot: `${SITE}assets/social-preview.png`,
        sameAs: [REPO],
        keywords: 'AI QA testing, Claude Code plugin, Codex plugin, MCP server, Playwright, exploratory testing, end-to-end testing, accessibility testing, regression testing, test impact analysis',
        featureList: [
          'Human-like crawls of every screen for every role, on desktop and phone width',
          'Visibility checks: covered, clipped, transparent and off-screen controls, scroll locks',
          'Accessibility checks: unlabeled controls, indistinct button names, low contrast, tiny tap targets',
          'Read-only crawls that block every write request at the network level',
          'Scripted journeys and act mode for real workflows',
          'Code index and change impact to re-test only what changed (NEW / FIXED / STILL)',
          'Browser modes: local, headless, CDP, n.eko and Orca',
          'Never-push guard for QA data',
        ],
      },
      {
        '@type': 'SoftwareSourceCode',
        '@id': `${SITE}#code`,
        name: 'blindqa',
        codeRepository: REPO,
        programmingLanguage: 'JavaScript',
        runtimePlatform: 'Node.js',
        license: 'https://opensource.org/licenses/MIT',
        author: { '@id': `${SITE}#author` },
        targetProduct: { '@id': `${SITE}#app` },
      },
    ],
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
