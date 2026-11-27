// Whether a newer release of this plugin is out: GitHub's latest release of the repository, as
// compared with the installed version. Shown as a status bar item only when there is one.
// The request carries nothing about the person: no token, a generic User-Agent.

export const REPOSITORY = 'ngxuancam/orca-backlog'
const LATEST_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`

export type Release = { version: string; url: string }

/** `v0.3.12` or `0.3.12` → [0, 3, 12]; null when it is not a plain version. */
export function parseVersion(text: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(text.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** Whether `latest` is a newer version than `installed`. */
export function isNewer(latest: string, installed: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(installed)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a[i]! !== b[i]!) return a[i]! > b[i]!
  return false
}

/** The latest published release (not a draft or pre-release); null when GitHub has none. */
export async function latestRelease(fetchImpl: typeof fetch = fetch): Promise<Release | null> {
  const res = await fetchImpl(LATEST_URL, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'orca-backlog-plugin' },
    signal: AbortSignal.timeout(20_000)
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub ${res.status}`)
  const body = (await res.json()) as { tag_name?: unknown; html_url?: unknown; draft?: unknown; prerelease?: unknown }
  if (body.draft || body.prerelease || typeof body.tag_name !== 'string' || !parseVersion(body.tag_name)) return null
  const url = typeof body.html_url === 'string' && body.html_url.startsWith('https://github.com/') ? body.html_url : `https://github.com/${REPOSITORY}/releases/latest`
  return { version: body.tag_name.replace(/^v/, ''), url }
}

/** Where the worker asks; tests swap it. */
export const updateSource = { latest: latestRelease }
