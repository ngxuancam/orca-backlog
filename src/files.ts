// Saving attachments and showing them with the OS: the worker's only file-system code.
import { spawn } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
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
  if (existing?.isFile() && existing.size === size) return
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
