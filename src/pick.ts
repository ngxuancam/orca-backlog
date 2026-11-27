// Files for a comment. The panel has no file input, paste or drop, so the worker asks the OS:
// an image on the clipboard (a screenshot) or files chosen in the OS's open dialog.

import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Run = { code: number; stdout: Buffer; stderr: string }

/** Runs a command; `missing` when it is not installed (so the next one can be tried). */
function run(command: string, args: string[], timeout = 115_000): Promise<Run | 'missing'> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    const out: Buffer[] = []
    let err = ''
    const timer = setTimeout(() => child.kill(), timeout)
    child.stdout.on('data', (b: Buffer) => out.push(b))
    child.stderr.on('data', (b: Buffer) => (err += String(b)))
    child.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      if (e.code === 'ENOENT') resolve('missing')
      else reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, stdout: Buffer.concat(out), stderr: err.trim() })
    })
  })
}

/** Windows PowerShell 5 (STA by default, which the clipboard and dialogs need), UTF-8 out. */
const powershell = (script: string) =>
  run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-STA',
    '-Command',
    `[Console]::OutputEncoding = [Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms, System.Drawing; ${script}`
  ])

/** A PowerShell single-quoted string. */
const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`

const lines = (b: Buffer) =>
  String(b)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

/** Where pasted images wait until the comment is sent. */
export const pasteFolder = () => join(tmpdir(), 'orca-backlog-tasks', 'paste')

/** `20261127-103045123`: to the millisecond, so two pastes never share a name. */
const stamp = () => new Date().toISOString().replace(/[-:.]/g, '').replace('T', '-').slice(0, 18)

export type Pasted = { image: string } | { files: string[] } | { none: string }

/**
 * The clipboard's image, saved as `paste-<time>.png`; or the files copied in the file manager
 * (Windows). `none` says why there is nothing to attach.
 */
export async function pasteFromClipboard(): Promise<Pasted> {
  await mkdir(pasteFolder(), { recursive: true })
  const path = join(pasteFolder(), `paste-${stamp()}.png`)
  if (process.platform === 'win32') {
    const r = await powershell(
      [
        `$files = [System.Windows.Forms.Clipboard]::GetFileDropList()`,
        `if ($files.Count -gt 0) { 'files'; $files; exit 0 }`,
        `$image = [System.Windows.Forms.Clipboard]::GetImage()`,
        `if ($image -eq $null) { exit 3 }`,
        `$image.Save(${psQuote(path)}, [System.Drawing.Imaging.ImageFormat]::Png); 'image'`
      ].join('; ')
    )
    if (r === 'missing') return { none: 'PowerShell is not available.' }
    if (r.code === 3) return { none: 'The clipboard holds no image. Take a screenshot or copy an image first.' }
    if (r.code !== 0) throw new Error(`Cannot read the clipboard: ${r.stderr.split('\n')[0] || `exit ${r.code}`}`)
    const [kind, ...rest] = lines(r.stdout)
    return kind === 'files' ? { files: rest } : { image: path }
  }
  if (process.platform === 'darwin') {
    const r = await run('osascript', [
      '-e', 'on run argv',
      '-e', 'try',
      '-e', 'set png to (the clipboard as «class PNGf»)',
      '-e', 'on error',
      '-e', 'return "none"',
      '-e', 'end try',
      '-e', 'set f to open for access (POSIX file (item 1 of argv)) with write permission',
      '-e', 'write png to f',
      '-e', 'close access f',
      '-e', 'return "image"',
      '-e', 'end run',
      path
    ])
    if (r === 'missing') return { none: 'osascript is not available.' }
    if (r.code !== 0) throw new Error(`Cannot read the clipboard: ${r.stderr || `exit ${r.code}`}`)
    return String(r.stdout).trim() === 'image' ? { image: path } : { none: 'The clipboard holds no image. Take a screenshot or copy an image first.' }
  }
  for (const [command, args] of [
    ['wl-paste', ['--no-newline', '--type', 'image/png']],
    ['xclip', ['-selection', 'clipboard', '-t', 'image/png', '-o']]
  ] as [string, string[]][]) {
    const r = await run(command, args, 15_000)
    if (r === 'missing') continue
    if (r.code !== 0 || !r.stdout.length) return { none: 'The clipboard holds no image. Take a screenshot or copy an image first.' }
    await writeFile(path, r.stdout)
    return { image: path }
  }
  return { none: 'Install wl-clipboard or xclip to paste images.' }
}

/** Files chosen in the OS's open dialog; empty when the person cancels. */
export async function chooseFiles(title: string): Promise<string[]> {
  if (process.platform === 'win32') {
    const r = await powershell(
      [
        `$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }`,
        `$d = New-Object System.Windows.Forms.OpenFileDialog`,
        `$d.Multiselect = $true; $d.Title = ${psQuote(title)}`,
        `$d.Filter = 'Images|*.png;*.jpg;*.jpeg;*.gif;*.webp;*.bmp|All files|*.*'`,
        `if ($d.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $d.FileNames }`,
        `$owner.Dispose()`
      ].join('; ')
    )
    if (r === 'missing') throw new Error('PowerShell is not available.')
    if (r.code !== 0) throw new Error(`Cannot open the file dialog: ${r.stderr.split('\n')[0] || `exit ${r.code}`}`)
    return lines(r.stdout)
  }
  if (process.platform === 'darwin') {
    const r = await run('osascript', [
      '-e', 'on run argv',
      '-e', 'try',
      '-e', 'set picked to choose file with prompt (item 1 of argv) with multiple selections allowed',
      '-e', 'on error number -128',
      '-e', 'return ""',
      '-e', 'end try',
      '-e', 'set out to ""',
      '-e', 'repeat with f in picked',
      '-e', 'set out to out & POSIX path of f & linefeed',
      '-e', 'end repeat',
      '-e', 'return out',
      '-e', 'end run',
      title
    ])
    if (r === 'missing') throw new Error('osascript is not available.')
    if (r.code !== 0) throw new Error(`Cannot open the file dialog: ${r.stderr || `exit ${r.code}`}`)
    return lines(r.stdout)
  }
  for (const [command, args] of [
    ['zenity', ['--file-selection', '--multiple', '--separator=\n', `--title=${title}`]],
    ['kdialog', ['--getopenfilename', '.', '--multiple', '--separate-output', '--title', title]]
  ] as [string, string[]][]) {
    const r = await run(command, args)
    if (r === 'missing') continue
    return r.code === 0 ? lines(r.stdout) : [] // 1: cancelled
  }
  throw new Error('Install zenity or kdialog to choose files.')
}

/** What the worker calls; tests swap it. */
export const picker = { paste: pasteFromClipboard, choose: chooseFiles }
