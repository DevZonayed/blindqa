/** The package itself: every module parses, manifests agree, skills and agents are well formed, the MCP server starts. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './helpers.mjs'

const files = (dir) => readdirSync(join(ROOT, dir)).flatMap((f) => {
  const p = join(dir, f)
  return statSync(join(ROOT, p)).isDirectory() ? files(p) : [p]
})
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
const frontmatter = (text) => Object.fromEntries((text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '').split('\n').map((l) => l.match(/^(\w+):\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]))

test('every module parses', () => {
  for (const f of [...files('src'), ...files('bin'), ...files('mcp'), ...files('test')].filter((f) => f.endsWith('.mjs'))) {
    execFileSync(process.execPath, ['--check', join(ROOT, f)])
  }
})

test('manifests parse and agree on name and version', () => {
  const pkg = json('package.json')
  const claude = json('.claude-plugin/plugin.json')
  const codex = json('.codex-plugin/plugin.json')
  for (const m of [claude, codex]) {
    assert.equal(m.name, 'blindqa')
    assert.equal(m.version, pkg.version, 'plugin versions must match package.json')
    assert.equal(m.license, pkg.license)
  }
  assert.equal(json('.claude-plugin/marketplace.json').plugins[0].name, 'blindqa')
  assert.equal(json('.agents/plugins/marketplace.json').plugins[0].name, 'blindqa')
  assert.equal(json('.codex-plugin/mcp.json').mcpServers.blindqa.cwd, './', 'Codex does not expand ${PLUGIN_ROOT} in cwd')
})

test('skills have a name matching their folder and a description', () => {
  const dirs = readdirSync(join(ROOT, 'skills'))
  assert.ok(dirs.includes('blindqa'), 'the router skill exists')
  for (const d of dirs) {
    const fm = frontmatter(readFileSync(join(ROOT, 'skills', d, 'SKILL.md'), 'utf8'))
    assert.equal(fm.name, d, `skills/${d}/SKILL.md name`)
    assert.ok(fm.description?.length > 40, `skills/${d} needs a real description`)
  }
})

test('agents declare a model and read-only tools', () => {
  for (const f of readdirSync(join(ROOT, 'agents'))) {
    const fm = frontmatter(readFileSync(join(ROOT, 'agents', f), 'utf8'))
    assert.ok(fm.name && fm.description && fm.model, `agents/${f} frontmatter`)
    assert.ok(!/\b(Write|Edit|Bash)\b/.test(fm.tools ?? ''), `agents/${f} must stay read-only`)
  }
})

test('CLI help lists the commands', () => {
  const out = execFileSync(process.execPath, [join(ROOT, 'bin/blindqa.mjs'), 'help'], { encoding: 'utf8' })
  for (const cmd of ['init', 'doctor', 'guard', 'machine', 'crawl', 'journey', 'index', 'changes', 'retest']) assert.match(out, new RegExp(`blindqa ${cmd}\\b`))
})

test('MCP server starts and exposes the blindqa tools', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
  const client = new Client({ name: 'test', version: '1' })
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(ROOT, 'mcp/server.mjs')], env: process.env }))
  const { tools } = await client.listTools()
  await client.close()
  const names = tools.map((t) => t.name)
  for (const t of ['blindqa_init', 'blindqa_doctor', 'blindqa_crawl', 'blindqa_journey', 'blindqa_guard', 'blindqa_machine', 'blindqa_index', 'blindqa_changes', 'blindqa_retest']) assert.ok(names.includes(t), `missing ${t}`)
  assert.ok(names.every((n) => n.startsWith('blindqa_')))
})
