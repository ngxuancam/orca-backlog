// Backlog AI Assistant from the panel. It has no public API: its web chat (a Mastra agent named
// `ai-assistant`) streams answers from the space's own `/ai/agents/ai-assistant/stream`, signed in
// by the web login's cookies. The worker runs that request inside a tab of Orca's browser on the
// space (`orca eval`), so the session stays in the browser; the plugin never sees a cookie.
//
// Unofficial: Nulab can change it with any release of their web app. Everything here fails with a
// message that says so, and the chat stays usable on the web.

import type { AiAnswer } from './protocol'

export const AI_AGENT = 'ai-assistant'

/** Whether the space has the assistant, as the panel shows it. */
export type AiStatus = 'available' | 'unavailable' | 'signedOut' | 'unknown'

/**
 * A browser expression that reads, from a page of the space, whether this user can use the
 * assistant: the page loads the chat only then (`ai-agent/chat-ui-loader.js`), and its plan
 * features say `"aiAssistant":true`. Without Premium the page has an "Upgrade" button instead, so
 * the button alone proves nothing. No Backlog header: the tab is on a login page.
 */
export const STATUS_EXPRESSION = `(() => {
  if (!document.querySelector('header.global-header')) return JSON.stringify({ state: 'signedOut' })
  const loader = !!document.querySelector('script[src*="/ai/assets/ai-agent/chat-ui-loader"]')
  const flags = []
  for (const s of document.scripts) {
    if (s.src) continue
    for (const m of s.textContent.matchAll(/"aiAssistant"\\s*:\\s*(true|false)/g)) flags.push(m[1] === 'true')
  }
  const plan = flags.length ? flags.includes(true) : null
  return JSON.stringify({ state: loader && plan !== false ? 'available' : 'unavailable' })
})()`

export function readStatus(json: unknown): AiStatus {
  try {
    const state = (JSON.parse(String(json)) as { state?: unknown }).state
    return state === 'available' || state === 'unavailable' || state === 'signedOut' ? state : 'unknown'
  } catch {
    return 'unknown'
  }
}

/** What the page script returns: an answer, or why there is none. */
export type AiResult =
  | ({ ok: true } & AiAnswer)
  | { ok: false; reason: 'login' | 'disabled' | 'error'; status?: number; message?: string }

/**
 * A browser expression (run with `orca eval` in a tab of the space) that asks one question and
 * resolves to the JSON of an `AiResult`. Only the answer travels back, not the raw stream (whose
 * last events repeat the whole conversation).
 */
export function askExpression(question: string, threadId: string | null): string {
  const input = JSON.stringify({ question, threadId, agent: AI_AGENT })
  return `(async (input) => {
  const lang = (document.documentElement.lang || navigator.language || 'en').slice(0, 2)
  const body = { messages: [{ role: 'user', content: input.question }], requestContext: { lang } }
  if (input.threadId) body.memory = { thread: { id: input.threadId } }
  let res
  try {
    res = await fetch('/ai/agents/' + input.agent + '/stream', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-backlog-user-language': lang },
      body: JSON.stringify(body)
    })
  } catch (e) {
    return JSON.stringify({ ok: false, reason: 'error', message: String(e && e.message || e) })
  }
  const type = res.headers.get('content-type') || ''
  // Signed out: a 401, or the login page in place of the stream.
  if (res.status === 401 || res.redirected || (res.ok && type.includes('text/html'))) return JSON.stringify({ ok: false, reason: 'login', status: res.status })
  if (res.status === 403 || res.status === 404) return JSON.stringify({ ok: false, reason: 'disabled', status: res.status })
  const raw = await res.text()
  if (!res.ok) return JSON.stringify({ ok: false, reason: 'error', status: res.status, message: raw.slice(0, 300) })
  let threadId = input.threadId || null, text = '', approval = null, error = null
  const tools = []
  for (const line of raw.split('\\n')) {
    if (!line.startsWith('data:')) continue
    let c
    try { c = JSON.parse(line.slice(5)) } catch { continue }
    const p = c.payload || {}
    if (c.threadId) threadId = c.threadId
    if (c.type === 'text-delta') text += p.text || ''
    else if (c.type === 'tool-call' && p.toolName && !tools.includes(p.toolName)) tools.push(p.toolName)
    else if (c.type === 'tool-call-approval') approval = p.toolName || 'a change'
    else if (c.type === 'error') error = (p.error && p.error.message) || p.message || 'The assistant stopped with an error.'
  }
  if (!text && error) return JSON.stringify({ ok: false, reason: 'error', message: error })
  return JSON.stringify({ ok: true, threadId, text, tools, approval })
})(${input})`
}

/** The page script's JSON, checked: anything else means the web app changed under us. */
export function readResult(json: unknown): AiResult {
  let value: unknown = json
  if (typeof json === 'string') {
    try {
      value = JSON.parse(json)
    } catch {
      return { ok: false, reason: 'error', message: 'The Backlog tab gave no answer.' }
    }
  }
  const r = value as Partial<AiResult> | null
  if (!r || typeof r !== 'object' || typeof r.ok !== 'boolean') return { ok: false, reason: 'error', message: 'The Backlog tab gave no answer.' }
  if (!r.ok) return r as AiResult
  const a = r as Partial<AiAnswer>
  return {
    ok: true,
    threadId: typeof a.threadId === 'string' ? a.threadId : null,
    text: typeof a.text === 'string' ? a.text : '',
    tools: Array.isArray(a.tools) ? a.tools.filter((t): t is string => typeof t === 'string') : [],
    approval: typeof a.approval === 'string' ? a.approval : null
  }
}

/** Why a question got no answer, for the panel. */
export function failureMessage(r: Exclude<AiResult, { ok: true }>, space: string): string {
  if (r.reason === 'login') return `Log in to ${space} in Orca's browser (the tab that just opened), then ask again.`
  if (r.reason === 'disabled') {
    return 'The Backlog AI Assistant is not available here: it needs the Premium plan or higher, turned on by a space administrator.'
  }
  const detail = [r.status ? `HTTP ${r.status}` : '', r.message ?? ''].filter(Boolean).join(': ')
  return `Backlog AI did not answer${detail ? ` (${detail})` : ''}. Its web chat may have changed; it still works on the web.`
}

// --- Chat history ------------------------------------------------------------------------------

/**
 * A browser expression that GETs paths under the chat's `/ai` and resolves to the JSON of
 * `{ status, json }[]`, one per path. Reading what came back is left to `toHistory` / `toTurns`,
 * which run in the worker and are tested there.
 */
export function getExpression(paths: string[]): string {
  return `(async (paths) => JSON.stringify(await Promise.all(paths.map(async (path) => {
  try {
    const res = await fetch('/ai' + path, { credentials: 'same-origin', headers: { 'x-backlog-user-language': (document.documentElement.lang || 'en').slice(0, 2) } })
    const type = res.headers.get('content-type') || ''
    if (res.status === 401 || res.redirected || (res.ok && type.includes('text/html'))) return { status: 401, json: null }
    let json = null
    try { json = await res.json() } catch {}
    return { status: res.status, json }
  } catch (e) {
    return { status: 0, json: null }
  }
}))))(${JSON.stringify(paths)})`
}

export type Fetched = { status: number; json: unknown }

export function readFetched(json: unknown, count: number): Fetched[] {
  try {
    const list = JSON.parse(String(json)) as Fetched[]
    if (Array.isArray(list) && list.length === count) return list
  } catch {
    // below
  }
  return Array.from({ length: count }, () => ({ status: 0, json: null }))
}

export const threadsPath = `/memory/threads?agentId=${AI_AGENT}`
export const usagePath = '/usage/availability'
export const messagesPath = (threadId: string, perPage = 40) =>
  `/memory/threads/${encodeURIComponent(threadId)}/messages?agentId=${AI_AGENT}&page=0&perPage=${perPage}`

export type AiThread = { id: string; title: string; updated: number }
/** `warning`: most of the month's credits are used; `unavailable`: none are left. */
export type AiUsage = { state: string; percent: number | null }

/** The threads, newest first, as the web's history lists them. */
export function toHistory(threads: Fetched, usage: Fetched): { threads: AiThread[]; usage: AiUsage | null } {
  const raw = threads.json as { threads?: unknown } | unknown[] | null
  const list = (Array.isArray(raw) ? raw : Array.isArray((raw as { threads?: unknown })?.threads) ? (raw as { threads: unknown[] }).threads : []) as {
    id?: unknown
    title?: unknown
    updatedAt?: unknown
  }[]
  const out = list
    .filter((t) => typeof t.id === 'string')
    .map((t) => ({
      id: t.id as string,
      title: typeof t.title === 'string' && t.title.trim() ? t.title : 'New chat',
      updated: Date.parse(String(t.updatedAt)) || 0
    }))
    .sort((a, b) => b.updated - a.updated)
  const u = usage.json as { availability?: unknown; usagePercentage?: unknown } | null
  return {
    threads: out,
    usage:
      usage.status === 200 && u && typeof u.availability === 'string'
        ? { state: u.availability, percent: typeof u.usagePercentage === 'number' ? Math.round(u.usagePercentage * 100) : null }
        : null
  }
}

type Part = { type?: unknown; text?: unknown }
type Message = { role?: unknown; parts?: unknown; content?: unknown }

const textOf = (m: Message) =>
  Array.isArray(m.parts)
    ? (m.parts as Part[])
        .filter((p) => p.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text as string)
        .join('')
    : typeof m.content === 'string'
      ? m.content
      : ''

const toolsOf = (m: Message) =>
  Array.isArray(m.parts)
    ? (m.parts as Part[]).flatMap((p) => (typeof p.type === 'string' && p.type.startsWith('tool-') ? [p.type.slice(5)] : []))
    : []

/**
 * A thread's messages (Backlog gives the newest first) as question-and-answer turns, oldest first.
 * `more`: older messages exist than were read.
 */
export function toTurns(fetched: Fetched): { turns: { question: string; answer: AiAnswer }[]; more: boolean } {
  const body = fetched.json as { messages?: unknown; pagination?: { hasMore?: unknown } } | null
  const messages = (Array.isArray(body?.messages) ? [...(body!.messages as Message[])] : []).reverse()
  const turns: { question: string; answer: AiAnswer }[] = []
  for (const m of messages) {
    if (m.role === 'user') {
      turns.push({ question: textOf(m), answer: { threadId: null, text: '', tools: [], approval: null } })
      continue
    }
    if (m.role !== 'assistant') continue
    if (!turns.length) turns.push({ question: '', answer: { threadId: null, text: '', tools: [], approval: null } })
    const answer = turns[turns.length - 1]!.answer
    const text = textOf(m)
    answer.text = [answer.text, text].filter(Boolean).join('\n\n')
    for (const tool of toolsOf(m)) if (!answer.tools.includes(tool)) answer.tools.push(tool)
  }
  return { turns, more: body?.pagination?.hasMore === true }
}
