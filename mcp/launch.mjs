#!/usr/bin/env node
/**
 * Plugin entry point. A plugin installed from GitHub arrives without node_modules, so install the
 * three runtime dependencies on first start (output to stderr: stdout belongs to the MCP protocol),
 * then start the server.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
if (!existsSync(`${root}node_modules/@modelcontextprotocol/sdk`) || !existsSync(`${root}node_modules/playwright`)) {
  process.stderr.write('blindqa: installing dependencies (first start only)…\n')
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const r = spawnSync(npm, ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: root, stdio: ['ignore', 2, 2] })
  if (r.status !== 0) { process.stderr.write('blindqa: npm install failed — run it by hand in ' + root + '\n'); process.exit(1) }
}
await import('./server.mjs')
