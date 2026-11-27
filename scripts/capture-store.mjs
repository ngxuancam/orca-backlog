// Recaptures every image in the README and on the plugin's store page, from mock data only:
// the web panel's preview (src/web/preview.ts, a fictional "Acme Shop") and the compose page
// (scripts/store/compose.html). Needs Orca running, `npm run build:web`, and the preview server:
//   node scripts/preview-web.mjs      (in another terminal)
//   node scripts/capture-store.mjs
import { execFileSync } from 'node:child_process'
import { copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../', import.meta.url))
const base = 'http://localhost:5179'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function orca(...args) {
  let out
  try {
    out = execFileSync('orca', [...args, '--json'], { cwd: repo, maxBuffer: 32 << 20 }).toString()
  } catch (error) {
    out = String(error.stdout ?? '')
  }
  const parsed = JSON.parse(out || '{}')
  if (!parsed.ok) throw new Error(`orca ${args[0]}: ${parsed.error?.message ?? out}`)
  return parsed.result
}

const page = orca('tab', 'create', '--url', `${base}/web/preview.html#home`, '--worktree', 'active').browserPageId

async function shoot(url, width, height, out, { wait = 1500, act } = {}) {
  orca('viewport', '--page', page, '--width', String(width), '--height', String(height))
  orca('eval', '--page', page, '--expression', `location.replace(${JSON.stringify(url)}); 1`)
  await sleep(1200)
  // A page load resets the viewport: set it again.
  orca('viewport', '--page', page, '--width', String(width), '--height', String(height))
  await sleep(wait)
  if (act) {
    orca('eval', '--page', page, '--expression', act)
    await sleep(1200)
  }
  const { path } = orca('screenshot', '--page', page)
  copyFileSync(path, join(repo, out))
  console.log('wrote', out)
}

/** A fresh load each time (`t`), then `#screen&theme` for the preview. */
const preview = (screen, dark) => `${base}/web/preview.html?t=${Date.now()}#${screen}${dark ? '&dark' : ''}`

const openThread = "(() => { document.querySelector('.history-toggle')?.click(); setTimeout(() => document.querySelector('.thread')?.click(), 400); return 1 })()"

try {
  for (const dark of [true, false]) {
    const theme = dark ? 'dark' : 'light'
    await shoot(preview('home', dark), 560, 860, `assets/home-${theme}.png`)
    await shoot(preview('detail', dark), 560, 1040, `assets/detail-${theme}.png`, { wait: 2200 })
    await shoot(preview('settings', dark), 560, 760, `assets/settings-${theme}.png`)
    await shoot(preview('ai', dark), 560, 760, `assets/ai-${theme}.png`, { act: openThread })
  }
  for (const kind of ['cover', 'home', 'detail', 'ai', 'settings']) {
    await shoot(`${base}/store/compose.html?kind=${kind}&t=${Date.now()}`, 1600, 1000, `assets/store/${kind}.png`, { wait: 1200 })
  }
} finally {
  orca('tab', 'close', '--page', page)
}
