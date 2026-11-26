import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, assert, test } from 'orca/testing'
import { checkMerge, remoteFor, remoteKey, runGit } from './git'

test('one repository reads the same over https, ssh and scp forms', () => {
  const key = 'acme.backlog.com/git/app/web'
  assert.equal(remoteKey('https://acme.backlog.com/git/APP/web.git'), key)
  assert.equal(remoteKey('https://me@acme.backlog.com/git/APP/web'), key)
  assert.equal(remoteKey('https://acme.backlog.com:443/git/APP/web.git/'), key)
  assert.equal(remoteKey('acme@acme.git.backlog.com:/APP/web.git'), 'acme.git.backlog.com/app/web')
  assert.equal(remoteKey('ssh://acme@acme.git.backlog.com/APP/web.git'), 'acme.git.backlog.com/app/web')
  assert.notEqual(remoteKey('https://acme.backlog.com/git/APP/web2.git'), key)
})

let dir = ''
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = ''
})

const sh = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'init.defaultBranch=main', ...args], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe']
  }).toString()

/** A "server" repository with main, a branch that merges cleanly and one that conflicts; and a clone of it. */
function repos() {
  dir = mkdtempSync(join(tmpdir(), 'bt-git-'))
  const work = join(dir, 'work')
  mkdirSync(work)
  sh(work, 'init', '-q')
  writeFileSync(join(work, 'a.txt'), 'one\ntwo\nthree\n')
  writeFileSync(join(work, 'b.txt'), 'b\n')
  sh(work, 'add', '.')
  sh(work, 'commit', '-qm', 'start')
  sh(work, 'checkout', '-qb', 'clean')
  writeFileSync(join(work, 'b.txt'), 'b changed\n')
  sh(work, 'commit', '-qam', 'clean change')
  sh(work, 'checkout', '-q', 'main')
  sh(work, 'checkout', '-qb', 'clash')
  writeFileSync(join(work, 'a.txt'), 'one\nTWO on the branch\nthree\n')
  sh(work, 'commit', '-qam', 'branch change')
  sh(work, 'checkout', '-q', 'main')
  writeFileSync(join(work, 'a.txt'), 'one\ntwo on main\nthree\n')
  sh(work, 'commit', '-qam', 'main change')
  const server = join(dir, 'server.git')
  sh(dir, 'clone', '-q', '--bare', work, server)
  const clone = join(dir, 'clone')
  sh(dir, 'clone', '-q', server, clone)
  return { server, clone }
}

test('finds the remote of a clone and tells a clean merge from a conflict', async () => {
  const { server, clone } = repos()
  const remote = await remoteFor(runGit, clone, ['https://acme.backlog.com/git/APP/other.git', server])
  assert.equal(remote, 'origin')
  assert.equal(await remoteFor(runGit, clone, ['https://acme.backlog.com/git/APP/other.git']), null)
  assert.deepEqual(await checkMerge(runGit, clone, 'origin', 'main', 'clean'), { state: 'clean' })
  assert.deepEqual(await checkMerge(runGit, clone, 'origin', 'main', 'clash'), { state: 'conflict', files: ['a.txt'] })
  // The working tree and the checked-out branch are untouched.
  assert.equal(sh(clone, 'status', '--porcelain'), '')
  assert.equal(sh(clone, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'main')
  const missing = await checkMerge(runGit, clone, 'origin', 'main', 'gone')
  assert.equal(missing.state, 'unknown')
})
