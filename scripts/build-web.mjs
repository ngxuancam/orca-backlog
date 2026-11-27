// Builds the HTML panel into dist/web: Orca's own transpiler always targets its components JSX,
// so the panel is compiled here (`tsc -p src/web`, JSX to Preact's `h`), next to its vendored
// libraries and the page that loads it. Run `npm run build:web` after changing src/web; dist/ is
// committed, since Orca installs plugins without a build step.
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const out = join('dist', 'web')
rmSync('dist', { recursive: true, force: true })
mkdirSync(out, { recursive: true })
execFileSync(process.execPath, ['scripts/vendor.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'src/web'], { stdio: 'inherit' })
for (const file of ['index.html', 'preview.html', 'panel.css']) copyFileSync(join('src', 'web', file), join(out, file))
console.log('built', out)
