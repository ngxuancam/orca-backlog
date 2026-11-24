// Saving attachments and showing them with the OS: the worker's only file-system code.
import { spawn } from 'node:child_process'
import { mkdir, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { AttachmentKind } from './protocol'

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i
const VIDEO = /\.(mp4|webm|mov|m4v|ogv|mkv|avi)$/i

export function attachmentKind(name: string): AttachmentKind {
  return IMAGE.test(name) ? 'image' : VIDEO.test(name) ? 'video' : 'file'
}

/** A server-given name made safe as one path segment on every OS. */
export function safeName(raw: string, fallback = 'file'): string {
  const base = raw.split(/[/\\]/).pop() ?? ''
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_')
    .replace(/[. ]+$/, '')
    .trim()
  return !cleaned || cleaned === '.' || cleaned === '..' ? fallback : cleaned
}

/** `~/Downloads/orca-backlog-<project-name>` */
export function downloadsFolder(projectName: string): string {
  return join(homedir(), 'Downloads', `orca-backlog-${safeName(projectName, 'project')}`)
}

/** Writes `data` to `path` unless a file of the same size is already there. */
export async function saveOnce(path: string, data: () => Promise<ArrayBuffer>, size: number): Promise<void> {
  const existing = await stat(path).catch(() => null)
  if (existing?.isFile() && existing.size === size) {
    // Mark it used, so cleanup keeps what is still being opened.
    const now = new Date()
    await utimes(path, now, now).catch(() => undefined)
    return
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, Buffer.from(await data()))
}

/** A folder git ignores by itself, so previews never show up as changes in the workspace. */
export async function selfIgnoringFolder(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
  await writeFile(join(path, '.gitignore'), '*\n', { flag: 'w' })
}

function detached(command: string, args: string[]): void {
  spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: false }).unref()
}

/** Shows the file selected in Explorer / Finder, or opens its folder on Linux. */
export function revealInFolder(path: string): void {
  if (process.platform === 'win32') detached('explorer.exe', [`/select,${path}`])
  else if (process.platform === 'darwin') detached('open', ['-R', path])
  else detached('xdg-open', [dirname(path)])
}

/** Opens the file in the OS default app. */
export function openWithOs(path: string): void {
  if (process.platform === 'win32') detached('explorer.exe', [path])
  else detached(process.platform === 'darwin' ? 'open' : 'xdg-open', [path])
}

const DAY = 24 * 60 * 60 * 1000

/** Each sub-folder's size and when a file in it was last used. */
async function folderUse(dir: string): Promise<{ path: string; bytes: number; usedAt: number }[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  return Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map(async (e) => {
        const path = join(dir, e.name)
        const files = await readdir(path).catch(() => [] as string[])
        const stats = await Promise.all(files.map((name) => stat(join(path, name)).catch(() => null)))
        return {
          path,
          bytes: stats.reduce((sum, s) => sum + (s?.size ?? 0), 0),
          usedAt: Math.max(0, ...stats.map((s) => s?.mtimeMs ?? 0))
        }
      })
  )
}

/**
 * Keeps a preview folder small: drops each issue's folder unused for `maxAgeDays`, then the least
 * recently used ones until the rest fit in `maxBytes`. Errors are ignored; it is only a cache.
 */
export async function pruneCache(dir: string, { maxAgeDays = 7, maxBytes = 200 << 20 } = {}): Promise<number> {
  const folders = (await folderUse(dir)).sort((a, b) => b.usedAt - a.usedAt)
  const cutoff = Date.now() - maxAgeDays * DAY
  let kept = 0
  const drop: string[] = []
  for (const [index, folder] of folders.entries()) {
    // The most recently used folder always stays: it may be the preview open right now.
    if (index > 0 && (folder.usedAt < cutoff || kept + folder.bytes > maxBytes)) drop.push(folder.path)
    else kept += folder.bytes
  }
  await Promise.all(drop.map((path) => rm(path, { recursive: true, force: true }).catch(() => undefined)))
  return drop.length
}
