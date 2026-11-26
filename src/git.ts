// Whether an open pull request would merge cleanly. Backlog's API does not say, so the check runs
// git on a clone of the repository this computer already has (an Orca workspace).

import { execFile } from 'node:child_process'
import type { ConflictCheck } from './protocol'

/** Runs git in a folder; never prompts for a password (a prompt would hang the check). */
export type GitRun = (dir: string, args: string[], timeout?: number) => Promise<{ code: number; stdout: string; stderr: string }>

export const runGit: GitRun = (dir, args, timeout = 30_000) =>
  new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-C', dir, ...args],
      {
        timeout,
        windowsHide: true,
        maxBuffer: 8 << 20,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_ASKPASS: '', SSH_ASKPASS: '' }
      },
      (error, stdout, stderr) => {
        const code = error ? (typeof (error as { code?: unknown }).code === 'number' ? ((error as { code: number }).code) : -1) : 0
        if (error && code === -1) reject(new Error(String(stderr || error.message).trim()))
        else resolve({ code, stdout: String(stdout), stderr: String(stderr) })
      }
    )
  })

/**
 * A remote URL reduced to `host/path` so the forms of one repository compare equal:
 * `https://user@acme.backlog.com/git/APP/app.git`, `acme@acme.git.backlog.com:/APP/app.git`,
 * `ssh://acme@acme.git.backlog.com/APP/app`.
 */
export function remoteKey(url: string): string {
  let s = url.trim().toLowerCase()
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//.exec(s)
  if (scheme) s = s.slice(scheme[0].length)
  else s = s.replace(/^([^/:]+):/, '$1/') // scp form: user@host:path
  s = s.replace(/^[^@/]*@/, '') // user info
  s = s.replace(/:\d+(?=\/)/, '') // port
  return s
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
}

/** The remote of a folder whose URL is one of the repository's, if any. */
export async function remoteFor(git: GitRun, dir: string, urls: string[]): Promise<string | null> {
  const wanted = new Set(urls.filter(Boolean).map(remoteKey))
  const { code, stdout } = await git(dir, ['remote', '-v'])
  if (code !== 0) return null
  for (const line of stdout.split('\n')) {
    const [name, url] = line.trim().split(/\s+/)
    if (name && url && wanted.has(remoteKey(url))) return name
  }
  return null
}

const refName = (branch: string) => branch.replace(/^refs\/heads\//, '')

/**
 * Fetches the two branches (only those, no tags) and asks git whether merging `branch` into
 * `base` conflicts, without touching the working tree, the index or any local branch.
 */
export async function checkMerge(git: GitRun, dir: string, remote: string, base: string, branch: string): Promise<ConflictCheck> {
  const refs = [refName(base), refName(branch)]
  const tracking = refs.map((r) => `refs/remotes/${remote}/${r}`)
  const fetched = await git(dir, ['fetch', '--no-tags', '--quiet', remote, ...refs.map((r, i) => `+refs/heads/${r}:${tracking[i]}`)], 70_000)
  if (fetched.code !== 0) return { state: 'unknown', reason: `git fetch failed: ${firstLine(fetched.stderr)}` }
  const merged = await git(dir, ['merge-tree', '--write-tree', '--name-only', '--no-messages', tracking[0]!, tracking[1]!], 30_000)
  if (merged.code === 0) return { state: 'clean' }
  if (merged.code === 1) {
    // First line: the tree git would write; then the conflicted files.
    const files = merged.stdout.split('\n').slice(1).map((l) => l.trim()).filter(Boolean)
    return { state: 'conflict', files: [...new Set(files)] }
  }
  return { state: 'unknown', reason: `git merge-tree failed: ${firstLine(merged.stderr) || 'needs git 2.38 or later'}` }
}

const firstLine = (text: string) => text.trim().split('\n')[0]?.trim() ?? ''

/** The runner the worker uses; tests swap it. */
export const git: { run: GitRun } = { run: runGit }
