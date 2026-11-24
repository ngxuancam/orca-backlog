// Backlog issue text (description, comments) as the panel's Markdown draws it.
//
// Orca's Markdown and Image draw only image files that ship inside the plugin, and an installed
// plugin's folder is hashed and must not change (docs/reference/plugin-isolated-frames.md), so
// images are never written there. An image reference becomes an `attachment:<id>` link instead,
// which the panel turns into an "Open preview" button that opens the file in Orca's preview.
import { attachmentKind } from './files'
import { ATTACHMENT_SCHEME } from './protocol'

type Attachment = { id: number; name: string }

/** Orca refuses a Markdown block over 64 KiB; keep a margin for what the panel adds. */
const MAX_MARKDOWN_BYTES = 60 * 1024

/**
 * Backlog Markdown `![alt][file]` and Backlog notation `#image(file)` / `#thumbnail(file)` that
 * name one of the issue's image attachments, as `![alt](attachment:<id>)`. Others stay as written.
 */
export function inlineImages(text: string, attachments: readonly Attachment[]): string {
  const byName = new Map(attachments.filter((a) => attachmentKind(a.name) === 'image').map((a) => [a.name, a.id]))
  if (!byName.size) return text
  const image = (whole: string, alt: string, name: string) => {
    const id = byName.get(name.trim())
    return id === undefined ? whole : `![${alt}](${ATTACHMENT_SCHEME}${id})`
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

/** Cuts text that would exceed Orca's Markdown limit, saying so. */
export function capMarkdown(text: string): string {
  const bytes = new TextEncoder().encode(text)
  if (bytes.length <= MAX_MARKDOWN_BYTES) return text
  const cut = new TextDecoder().decode(bytes.slice(0, MAX_MARKDOWN_BYTES)).replace(/�$/, '')
  return `${cut}\n\n_… shortened here: open the issue in Backlog for the rest._`
}

/** Backlog text as the panel's Markdown draws it: image references as previews, breaks kept, capped. */
export const backlogMarkdown = (text: string, attachments: readonly Attachment[]) =>
  capMarkdown(keepLineBreaks(inlineImages(text, attachments)))
