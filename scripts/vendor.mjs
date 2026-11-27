// Copies the web panel's libraries into dist/web/vendor (types: src/web/vendor/*.d.ts): Orca loads panels with no bundler and no
// network, so their ESM builds ship with the plugin (relative imports only). Run after updating
// preact, marked or dompurify: `node scripts/vendor.mjs`.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = join('dist', 'web', 'vendor')
mkdirSync(out, { recursive: true })
const files = [
  ['node_modules/preact/dist/preact.module.js', 'preact.js'],
  ['node_modules/preact/hooks/dist/hooks.module.js', 'hooks.js', (s) => s.replace(/from\s*"preact"/g, 'from"./preact.js"')],
  ['node_modules/marked/lib/marked.esm.js', 'marked.js'],
  ['node_modules/dompurify/dist/purify.es.mjs', 'purify.js']
]
for (const [from, to, edit] of files) {
  const text = readFileSync(from, 'utf8').replace(/\n\/\/# sourceMappingURL=.*$/m, '')
  writeFileSync(join(out, to), edit ? edit(text) : text)
}
// Their licenses travel with them.
const licenses = ['preact', 'marked', 'dompurify'].map((name) => {
  const pkg = JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8'))
  const dir = `node_modules/${name}`
  const file = ['LICENSE', 'LICENSE.md', 'license'].map((f) => join(dir, f)).find((f) => existsSync(f))
  const text = readFileSync(file, 'utf8')
  return `${name} ${pkg.version} (${pkg.license})\n\n${text.trim()}\n`
})
writeFileSync(join(out, 'LICENSES.txt'), licenses.join('\n' + '-'.repeat(72) + '\n\n'))
console.log('vendored', files.map((f) => f[1]).join(', '))
