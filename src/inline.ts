// Images an issue's text points at, shown inline in the panel. Orca's Markdown draws only images
// that are files of the plugin, and Orca indexes those when the plugin loads: a file added later
// shows after the next reload. So the worker answers with the images already cached, downloads
// the missing ones into a staging folder Orca's dev watcher ignores, then moves them into
// `<plugin>/.cache/backlog-inline/<KEY>/` together: one reload, after which the panel (whose
// navigation survives reloads) shows them. Only the newest few issues are kept.
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { attachmentKind, safeName, saveOnce } from './files'

const PLUGIN_ROOT = fileURLToPath(new URL('..', import.meta.url))
/** Served as plugin files; a change here reloads a dev plugin. */
const SERVED = ['.cache', 'backlog-inline']
/** Ignored by the dev watcher, so downloads in progress reload nothing. */
const STAGING = ['node_modules', '.cache', 'backlog-staging']
const KEEP_ISSUES = 5
/** Larger images did not draw inline (a 1.9 MB PNG); they get a note instead. */
const MAX_BYTES = 1 << 20
/** The src that marks an image too large to show inline. */
const TOO_LARGE = ''

type Attachment = { id: number; name: string; size: number }

/** Backlog Markdown `![alt][file]` and Backlog notation `#image(file)` / `#thumbnail(file)`. */
export function inlineImages(text: string, srcByName: ReadonlyMap<string, string>): string {
  if (!srcByName.size) return text
  const image = (whole: string, alt: string, name: string) => {
    const src = srcByName.get(name.trim())
    if (src === undefined) return whole
    return src === TOO_LARGE ? `_${name}: too large to show here, open it from Attachments._` : `![${alt}](${src})`
  }
  return text
    .replace(/!\[([^\]]*)\]\[([^\]]+)\]/g, (whole, alt: string, name: string) => image(whole, alt || name, name))
    .replace(/#(?:image|thumbnail)\(([^)]+)\)/g, (whole, name: string) => image(whole, name, name))
}

/**
 * Backlog shows every line break; Markdown joins single ones into a paragraph. Ending each line
 * with two spaces keeps them, outside fenced code where breaks already stay.
 */
export function keepLineBreaks(text: string): string {
  let fenced = false
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line, index, lines) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
      const next = lines[index + 1]
      const breaks = !fenced && line.trim() !== '' && next !== undefined && next.trim() !== ''
      return breaks ? `${line.trimEnd()}  ` : line
    })
    .join('\n')
}

/** Backlog text as the panel's Markdown draws it: issue images inline, line breaks kept. */
export const backlogMarkdown = (text: string, srcByName: ReadonlyMap<string, string>) =>
  keepLineBreaks(inlineImages(text, srcByName))

/** Drops all but the most recently opened issues' folders. */
async function prune(dir: string, keep: string): Promise<void> {
  const entries = await readdir(dir).catch(() => [] as string[])
  const dated = await Promise.all(
    entries.map(async (name) => ({ name, at: (await stat(join(dir, name)).catch(() => null))?.mtimeMs ?? 0 }))
  )
  const stale = dated
    .filter((e) => e.name !== keep)
    .sort((a, b) => b.at - a.at)
    .slice(KEEP_ISSUES - 1)
  await Promise.all(stale.map((e) => rm(join(dir, e.name), { recursive: true, force: true })))
}

type Wanted = Attachment & { file: string }

/** The issue's image attachments that `texts` reference, by the file each is cached as. */
function wantedImages(attachments: readonly Attachment[], texts: readonly string[]): Wanted[] {
  const all = texts.join('\n')
  return attachments
    .filter((a) => attachmentKind(a.name) === 'image' && all.includes(a.name))
    .map((a) => ({ ...a, file: `${a.id}-${safeName(a.name)}` }))
}

const isCached = async (path: string, size: number) => (await stat(path).catch(() => null))?.size === size

/**
 * Name → path (relative to the plugin root) of the images already cached; the others, with
 * `missing`, for {@link publishImages}. An uncached reference stays as Backlog wrote it.
 */
export async function cachedImages(
  issueKey: string,
  attachments: readonly Attachment[],
  texts: readonly string[]
): Promise<{ srcByName: Map<string, string>; missing: Wanted[] }> {
  const folder = safeName(issueKey)
  const srcByName = new Map<string, string>()
  const missing: Wanted[] = []
  for (const a of wantedImages(attachments, texts)) {
    if (a.size > MAX_BYTES) srcByName.set(a.name, TOO_LARGE)
    else if (await isCached(join(PLUGIN_ROOT, ...SERVED, folder, a.file), a.size)) {
      srcByName.set(a.name, [...SERVED, folder, a.file].map(encodeURIComponent).join('/'))
    } else missing.push(a)
  }
  return { srcByName, missing }
}

/** Downloads `missing` into staging, then copies them into the served folder in one go. */
export async function publishImages(
  issueKey: string,
  missing: readonly Wanted[],
  download: (id: number) => Promise<ArrayBuffer>
): Promise<void> {
  const folder = safeName(issueKey)
  const staging = join(PLUGIN_ROOT, ...STAGING, folder)
  const served = join(PLUGIN_ROOT, ...SERVED)
  const done = await Promise.all(
    missing.map((a) =>
      saveOnce(join(staging, a.file), () => download(a.id), a.size).then(
        () => a,
        () => null // a failed download keeps Backlog's reference
      )
    )
  )
  const ready = done.filter((a): a is Wanted => a !== null)
  if (!ready.length) return
  await prune(served, folder)
  await mkdir(join(served, folder), { recursive: true })
  // Copied, not renamed: the dev index adds files it sees written, and misses a rename.
  await Promise.all(ready.map((a) => copyFile(join(staging, a.file), join(served, folder, a.file))))
  await rm(staging, { recursive: true, force: true })
}
