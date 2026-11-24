// Backlog API v2 client for the worker: the same endpoints nulab/backlog-mcp-server reaches
// through backlog-js (API-key auth as the `apiKey` query parameter).
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { appDataDir } from './platform'

export type Credentials = { space: string; apiKey: string }
type Scalar = string | number | boolean
export type Query = Record<string, Scalar | readonly Scalar[] | undefined>

/** `acme.backlog.com`, `https://acme.backlog.jp/` or `acme.backlog.com/view/X-1` → `acme.backlog.com`. */
export function normalizeSpace(input: string): string {
  const trimmed = input.trim()
  const host = trimmed.replace(/^https?:\/\//i, '').split(/[/?#]/)[0] ?? ''
  return host.toLowerCase()
}

function buildUrl({ space, apiKey }: Credentials, path: string, query: Query = {}): string {
  const url = new URL(`https://${space}/api/v2${path}`)
  url.searchParams.set('apiKey', apiKey)
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined) continue
    if (Array.isArray(value)) for (const item of value) url.searchParams.append(`${name}[]`, String(item))
    else url.searchParams.set(name, String(value))
  }
  return url.toString()
}

/** Raw response, for attachments. Throws Backlog's own error message on a failure. */
export async function request(creds: Credentials, path: string, query?: Query): Promise<Response> {
  let response: Response
  try {
    response = await fetch(buildUrl(creds, path, query))
  } catch (error) {
    throw new Error(`Cannot reach ${creds.space}: ${(error as Error).message}`)
  }
  if (response.ok) return response
  const body = (await response.json().catch(() => null)) as { errors?: { message: string }[] } | null
  const message = body?.errors?.map((e) => e.message).join('; ') || response.statusText
  throw new Error(`Backlog ${response.status}: ${message}`)
}

export async function api<T>(creds: Credentials, path: string, query?: Query): Promise<T> {
  return (await (await request(creds, path, query)).json()) as T
}

// --- Credentials already on this machine -------------------------------------------------------

function pairFrom(env: Record<string, unknown> | undefined): Credentials | null {
  const space = env?.BACKLOG_DOMAIN
  const apiKey = env?.BACKLOG_API_KEY
  return typeof space === 'string' && typeof apiKey === 'string' && space && apiKey
    ? { space: normalizeSpace(space), apiKey }
    : null
}

/** First `{ BACKLOG_DOMAIN, BACKLOG_API_KEY }` pair anywhere in a parsed JSON config. */
function findPair(value: unknown, depth = 0): Credentials | null {
  if (!value || typeof value !== 'object' || depth > 8) return null
  const own = pairFrom(value as Record<string, unknown>)
  if (own) return own
  for (const child of Object.values(value)) {
    const found = findPair(child, depth + 1)
    if (found) return found
  }
  return null
}

/** MCP client configs that commonly hold backlog-mcp-server's environment. */
function mcpConfigFiles(): string[] {
  const home = homedir()
  const appData = appDataDir()
  return [
    join(home, '.claude.json'),
    join(home, '.cursor', 'mcp.json'),
    join(home, '.codeium', 'windsurf', 'mcp_config.json'),
    join(appData, 'Claude', 'claude_desktop_config.json'),
    join(appData, 'Code', 'User', 'mcp.json')
  ]
}

/** Credentials from the environment, then from MCP configs; each source is tried in order. */
export async function discoverCredentials(): Promise<{ creds: Credentials; source: 'env' | 'mcp-config' }[]> {
  const found: { creds: Credentials; source: 'env' | 'mcp-config' }[] = []
  const fromEnv = pairFrom(process.env)
  if (fromEnv) found.push({ creds: fromEnv, source: 'env' })
  for (const file of mcpConfigFiles()) {
    const text = await readFile(file, 'utf8').catch(() => null)
    if (!text) continue
    try {
      const creds = findPair(JSON.parse(text))
      if (creds) found.push({ creds, source: 'mcp-config' })
    } catch {
      // Not JSON we can read: skip it.
    }
  }
  return found
}
