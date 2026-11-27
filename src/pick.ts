// Files for a comment chosen in the OS's open dialog (Attach file…). Pasted and dropped images
// come from the panel itself (`files.put`).

import { spawn } from 'node:child_process'
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

/** Where pasted and dropped images wait until the comment is sent. */
export const pasteFolder = () => join(tmpdir(), 'orca-backlog-tasks', 'paste')

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
export const picker = { choose: chooseFiles }
