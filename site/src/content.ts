// Page copy that is also used for structured data (FAQ) and the install tabs. Keep it true to the README.
export const installTabs = [
  { name: 'Claude Code', prompt: '>', code: '/plugin marketplace add DevZonayed/blindqa\n/plugin install blindqa@blindqa' },
  { name: 'Codex', prompt: '$', code: 'codex plugin marketplace add DevZonayed/blindqa\ncodex plugin add blindqa@blindqa' },
  { name: 'CLI', prompt: '$', code: 'git clone https://github.com/DevZonayed/blindqa.git\ncd blindqa && npm install && node bin/blindqa.mjs help' },
]

export const faq = [
  {
    q: 'How do I add QA testing to Claude Code or Codex?',
    a: 'Install the blindqa plugin with the two commands above, then ask your agent to "set up blindqa for this repo". The setup skill walks through the browser, the project folder, roles and logins.',
  },
  {
    q: 'Is blindqa an AI testing tool?',
    a: 'It is an AI QA tool for the agent you already use: Claude Code or Codex sets it up, decides what to run and checks what it finds. The testing itself is deterministic Playwright scripts, so two runs on the same app give the same results and a run costs no model tokens.',
  },
  {
    q: "Does it send my app's data to an AI model?",
    a: 'No. Crawls, journeys, act mode and re-tests run locally as scripts. Your coding agent reads only the short summaries and the screenshots it chooses to verify.',
  },
  {
    q: 'How is it different from Playwright MCP?',
    a: 'Playwright MCP hands your agent a browser, so every click and page read costs tokens and can vary between runs. blindqa runs the browser by script and gives the agent finished reports, and adds what a person would notice: visibility, scroll locks, every role, every menu, and re-tests of only what changed.',
  },
  {
    q: 'How is this different from writing Playwright tests?',
    a: 'Playwright tests check what you thought to assert. blindqa explores like a person — every screen, every role, every menu — and judges what a person can see and use, so it finds problems nobody wrote a test for. The journeys you write are still plain Playwright, with human-like helpers.',
  },
  {
    q: 'Does it need my source code?',
    a: 'No. Crawls and journeys work on any running web app. With the source, blindqa also builds a code index to re-test only what changed and to point each finding at its file.',
  },
  {
    q: 'Is it safe to run against my app?',
    a: 'Crawls are read-only: every write request is blocked at the network level and logged. Journeys and act mode change data, so run those against local or test environments.',
  },
  {
    q: 'Will it commit or push anything to my repository?',
    a: 'No. Everything it writes stays in .blindqa/, which ignores itself, is listed in .git/info/exclude, and is guarded by a pre-push hook that refuses any push containing it. blindqa never changes your tracked files.',
  },
  {
    q: 'Does it use a lot of AI tokens?',
    a: 'Only for setup, writing journeys and verifying new findings. Running crawls, journeys and re-tests costs no model tokens; your agent reads one short summary per run.',
  },
  {
    q: 'Does it check accessibility?',
    a: "It checks what a person meets: unlabeled controls, button names a screen reader can't tell apart, low text contrast (WCAG ratio), tiny tap targets and menus that won't close with Escape. It is not a full WCAG audit, so pair it with axe or Lighthouse for that.",
  },
  {
    q: 'Does it work in CI?',
    a: 'Yes. Use headless mode, and run "blindqa retest --run-tests --headless" on pull requests to re-test only what the change touches.',
  },
  {
    q: 'Which frameworks does the code index understand?',
    a: 'Routes from Next.js (app and pages router), React Router, SvelteKit, Nuxt, Remix and single-page apps; endpoints from NestJS, Express, Fastify, Hono-style routers and Next.js route handlers; imports through tsconfig aliases and monorepo packages. Anything else is still crawled — impact just falls back to wider re-tests.',
  },
]
