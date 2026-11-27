// Backlog API v2 client for the worker: the same endpoints nulab/backlog-mcp-server reaches
// through backlog-js (API-key auth as the `apiKey` query parameter).
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { certificatesApplied } from './certificates'
import { appDataDir } from './platform'

/** `fetch failed` hides the reason in `cause`; surface its code (e.g. SELF_SIGNED_CERT_IN_CHAIN). */
function reasonOf(error: unknown): string {
  const cause = (error as { cause?: { code?: string; message?: string } }).cause
  return cause?.code ?? cause?.message ?? (error as Error).message
}

export type Credentials = { space: string; apiKey: string }
type Scalar = string | number | boolean
export type Query = Record<string, Scalar | readonly Scalar[] | undefined>

/** `acme.backlog.com`, `https://acme.backlog.jp/` or `acme.backlog.com/view/X-1` → `acme.backlog.com`. */
export function normalizeSpace(input: string): string {
  const trimmed = input.trim()
  const host = trimmed.replace(/^https?:\/\//i, '').split(/[/?#]/)[0] ?? ''
  return host.toLowerCase()
}

/** Backlog's encoding: lists as `name[]`; an empty list as one empty `name[]`, which clears it. */
function appendParams(params: URLSearchParams, values: Query): URLSearchParams {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      if (!value.length) params.append(`${name}[]`, '')
      for (const item of value) params.append(`${name}[]`, String(item))
    } else params.set(name, String(value))
  }
  return params
}

function buildUrl({ space, apiKey }: Credentials, path: string, query: Query = {}): string {
  const url = new URL(`https://${space}/api/v2${path}`)
  url.searchParams.set('apiKey', apiKey)
  appendParams(url.searchParams, query)
  return url.toString()
}

/** Raw response, for attachments. Throws Backlog's own error message on a failure. */
export async function request(creds: Credentials, path: string, query?: Query, write?: Write): Promise<Response> {
  await certificatesApplied()
  let response: Response
  try {
    response = await fetch(
      buildUrl(creds, path, query),
      write
        ? { method: write.method, body: 'file' in write ? write.file : appendParams(new URLSearchParams(), write.form) }
        : undefined
    )
  } catch (error) {
    throw new Error(`Cannot reach ${creds.space}: ${reasonOf(error)}`)
  }
  if (response.ok) return response
  const body = (await response.json().catch(() => null)) as { errors?: { message: string }[] } | null
  const message = body?.errors?.map((e) => e.message).join('; ') || response.statusText
  throw new Error(`Backlog ${response.status}: ${message}`)
}

/** A change to Backlog, sent as a form like backlog-js sends it; or a file, as multipart. */
export type Write = { method: 'POST' | 'PATCH'; form: Query } | { method: 'POST'; file: FormData }

export async function send<T>(creds: Credentials, write: Write, path: string): Promise<T> {
  return (await (await request(creds, path, undefined, write)).json()) as T
}

/**
 * Uploads a file for a comment or an issue (`POST /space/attachment`); its id goes in the next
 * write's `attachmentId[]`. Backlog drops an upload nothing attaches within an hour.
 */
export async function uploadAttachment(creds: Credentials, name: string, data: Uint8Array<ArrayBuffer>): Promise<{ id: number; name: string; size: number }> {
  const file = new FormData()
  file.append('file', new Blob([data], { type: 'application/octet-stream' }), name)
  return send(creds, { method: 'POST', file }, '/space/attachment')
}

export async function api<T>(creds: Credentials, path: string, query?: Query): Promise<T> {
  return (await (await request(creds, path, query)).json()) as T
}

// --- Credentials already on this machine -------------------------------------------------------

/** MCP client configs that commonly hold backlog-mcp-server's environment, user-wide first. */
export function credentialFiles(workspacePath?: string): string[] {
  const home = homedir()
  const appData = appDataDir()
  return [
    join(home, '.claude.json'),
    join(home, '.cursor', 'mcp.json'),
    join(home, '.codeium', 'windsurf', 'mcp_config.json'),
    join(home, '.gemini', 'settings.json'),
    join(home, '.codex', 'config.toml'),
    join(appData, 'Claude', 'claude_desktop_config.json'),
    join(appData, 'Code', 'User', 'mcp.json'),
    join(appData, 'Code - Insiders', 'User', 'mcp.json'),
    ...(workspacePath
      ? [join(workspacePath, '.mcp.json'), join(workspacePath, '.vscode', 'mcp.json'), join(workspacePath, '.cursor', 'mcp.json')]
      : [])
  ]
}

const valuesOf = (text: string, name: string) =>
  [...text.matchAll(new RegExp(String.raw`["']?${name}["']?\s*[:=]\s*["']([^"'\r\n]+)["']`, 'g'))].map((m) => m[1]!.trim())

/**
 * Every `BACKLOG_DOMAIN` / `BACKLOG_API_KEY` pair in a config, in order. Read as text, so JSON with
 * comments (VS Code) and TOML (Codex) work too; the n-th domain goes with the n-th key.
 */
export function credentialPairs(text: string): Credentials[] {
  const spaces = valuesOf(text, 'BACKLOG_DOMAIN')
  const keys = valuesOf(text, 'BACKLOG_API_KEY')
  return spaces
    .slice(0, keys.length)
    .map((space, i) => ({ space: normalizeSpace(space), apiKey: keys[i]! }))
    .filter((c) => c.space && c.apiKey && !c.apiKey.startsWith('$'))
}

/**
 * Credentials from backlog-mcp-server entries in MCP client configs, without duplicates. Not from
 * the environment: Orca withholds tokens from plugin workers (docs/reference/plugin-authoring.md).
 */
export async function discoverCredentials(workspacePath?: string): Promise<{ creds: Credentials; file: string }[]> {
  const found = new Map<string, { creds: Credentials; file: string }>()
  for (const file of credentialFiles(workspacePath)) {
    const text = await readFile(file, 'utf8').catch(() => null)
    for (const creds of text ? credentialPairs(text) : []) {
      const key = `${creds.space} ${creds.apiKey}`
      if (!found.has(key)) found.set(key, { creds, file })
    }
  }
  return [...found.values()]
}
