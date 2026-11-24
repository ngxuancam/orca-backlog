// Sets the plugin version everywhere it is written, so a release never ships a stale one:
// orca-plugin.json, package.json (and its lockfile) and the README's version badge.
// Usage: npm run set-version 0.3.4
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const version = process.argv[2]
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Usage: npm run set-version <major.minor.patch>')
  process.exit(1)
}

for (const file of ['orca-plugin.json', 'package.json']) {
  const json = JSON.parse(readFileSync(file, 'utf8'))
  json.version = version
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n')
}

// A static badge: GitHub's image proxy gives up on shields' dynamic GitHub badges when they are slow.
const readme = readFileSync('README.md', 'utf8')
const badge = /https:\/\/img\.shields\.io\/badge\/version-v\d+\.\d+\.\d+-/
if (!badge.test(readme)) {
  console.error('README.md has no static version badge to update')
  process.exit(1)
}
writeFileSync('README.md', readme.replace(badge, `https://img.shields.io/badge/version-v${version}-`))

execSync('npm install --package-lock-only --silent', { stdio: 'inherit' })
console.log(`version ${version}: orca-plugin.json, package.json, package-lock.json, README badge`)
