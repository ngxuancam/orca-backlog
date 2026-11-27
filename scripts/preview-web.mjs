// Serves dist on http://localhost:5179 for the mock preview (src/web/preview.ts):
// open http://localhost:5179/web/preview.html#home (or #issues, #detail, #ai, #settings, #signedOut; add &dark).
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../dist/', import.meta.url))
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain' }

createServer(async (req, res) => {
  const wanted = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname).slice(1) || 'web/preview.html'
  const file = normalize(join(root, wanted))
  // Only files under dist.
  if (relative(root, file).startsWith('..')) return void res.writeHead(403).end()
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(5179, '127.0.0.1', () => console.log('http://localhost:5179/web/preview.html#home'))
