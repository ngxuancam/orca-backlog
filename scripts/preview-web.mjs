// Serves the mock preview on http://localhost:5179 (localhost only):
//   /web/preview.html#home   the web panel with mock data (or #issues, #detail, #ai, #settings,
//                            #signedOut; add &dark, &empty)
//   /store/compose.html?kind=cover   the store images, composed from assets/*.png
// Only dist/, assets/ and scripts/store/ are served.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../', import.meta.url))
const roots = { web: join(repo, 'dist', 'web'), protocol: join(repo, 'dist'), assets: join(repo, 'assets'), store: join(repo, 'scripts', 'store') }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain', '.png': 'image/png', '.svg': 'image/svg+xml' }

/** `/web/x.js` → dist/web/x.js; `/protocol.js`, `/mockData.js` → dist/; `/assets/…`, `/store/…`. */
function fileOf(pathname) {
  const parts = decodeURIComponent(pathname).split('/').filter(Boolean)
  if (!parts.length) return join(roots.web, 'preview.html')
  const [first, ...rest] = parts
  const root = first === 'web' ? roots.web : first === 'assets' ? roots.assets : first === 'store' ? roots.store : roots.protocol
  const file = normalize(join(root, ...(root === roots.protocol ? parts : rest)))
  return relative(root, file).startsWith('..') ? null : file
}

createServer(async (req, res) => {
  const file = fileOf(new URL(req.url ?? '/', 'http://localhost').pathname)
  if (!file) return void res.writeHead(403).end()
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(5179, '127.0.0.1', () => console.log('http://localhost:5179/web/preview.html#home'))
