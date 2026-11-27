// A stand-in Orca for looking at the web panel outside Orca: mock data only (src/mockData.ts).
// Served locally (`node scripts/preview-web.mjs`), it opens `preview.html#<screen>[&dark]`, where
// <screen> is home, issues, detail, ai, settings or signedOut. Not shipped: dist/web/preview.* is
// left out of the plugin by .gitignore.
import { requests, signedOutRequests } from '../mockData.js'

const [screen = 'home', ...flags] = location.hash.slice(1).split('&')
const dark = flags.includes('dark')

const palette = dark
  ? { background: '#16181d', foreground: '#e6e7ea', card: '#1c1f26', muted: '#262a33', 'muted-foreground': '#9aa0aa', accent: '#2a2f39', border: '#2f343e', input: '#3a404c', popover: '#1f232b' }
  : { background: '#f6f7f7', foreground: '#1f2328', card: '#ffffff', muted: '#f1f3f3', 'muted-foreground': '#687076', accent: '#eef1f1', border: '#e1e5e4', input: '#d6dbda', popover: '#ffffff' }
for (const [name, value] of Object.entries(palette)) document.documentElement.style.setProperty(`--orca-${name}`, value)
document.documentElement.classList.add(dark ? 'dark' : 'light')

const now = Date.now()
const answer = (text: string) => ({ threadId: 't1', text, tools: ['search-issues-tool'], approval: null })
const extra: Record<string, (input: never) => unknown> = {
  'ai.status': () => ({ state: 'available' }),
  'ai.history': () => ({
    threads: [
      { id: 't1', title: 'Checkout bugs this sprint', updated: now - 3_600_000 },
      { id: 't2', title: 'Release notes for v2.0', updated: now - 26 * 3_600_000 },
      { id: 't3', title: 'Who owns the search service?', updated: now - 5 * 86_400_000 }
    ],
    usage: { state: 'warning', percent: 91 }
  }),
  'ai.thread': () => ({
    turns: [
      { question: 'Which checkout bugs are still open?', answer: answer('Two are open:\n\n- **SHOP-142** Apple Pay button misaligned on checkout (In Progress)\n- **SHOP-139** Search suggestions ignore accents (Open)\n\nSHOP-142 has a pull request waiting for review.') }
    ],
    more: false
  }),
  'ai.ask': (input: { question: string }) => new Promise((resolve) => setTimeout(() => resolve(answer(`You asked: *${input.question}*. This is the preview, so the answer is made up.`)), 1200)),
  'runs.get': () => [{ workspaceId: 'w1', label: 'acme-shop / fix-SHOP-142', branch: 'fix/SHOP-142', agent: 'claude', skill: 'fixbug-backlog', startedAt: now - 40 * 60_000 }],
  'files.put': (input: { name: string; data: string }) => ({ id: `f${Math.random()}`, name: input.name, size: Math.round((input.data.length * 3) / 4), kind: /\.(png|jpe?g|gif|webp)$/i.test(input.name) ? 'image' : 'file' }),
  'files.drop': () => ({ dropped: 1 }),
  'pullRequest.assign': () => ({ ok: true }),
  // User 1 has a drawn icon; the others have none, so their initials show.
  'user.icon': (input: { userId: number }) => {
    if (input.userId !== 1) return Promise.reject(new Error('no icon'))
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const g = canvas.getContext('2d')!
    g.fillStyle = '#6c8ebf'
    g.fillRect(0, 0, 64, 64)
    g.fillStyle = '#f2d1b3'
    g.beginPath()
    g.arc(32, 26, 13, 0, Math.PI * 2)
    g.fill()
    g.fillRect(14, 44, 36, 24)
    return { mime: 'image/png', data: canvas.toDataURL('image/png').split(',')[1] }
  },
  'issue.get': () => {
    const issue = (requests as unknown as { 'issue.get': () => { description: string; comments: { content: string }[] } })['issue.get']()
    return {
      ...issue,
      assigneeId: 1,
      createdUserId: 2,
      pullRequests: (issue as unknown as { pullRequests: object[] }).pullRequests.map((pr) => ({ ...pr, projectId: 10, assignee: 'Sam Lee', assigneeId: 2 })),
      description: `${issue.description}

![checkout-safari.png](attachment:1)`,
      comments: issue.comments.map((c, i) => ({ ...c, authorId: i === 0 ? 2 : 1, ...(i === 0 ? { content: `${c.content}

![checkout-safari.png](attachment:1)` } : {}) }))
    }
  },
  // A drawn stand-in for the screenshot, after a pause like a download's.
  'attachment.data': () =>
    new Promise((resolve) =>
      setTimeout(() => {
        const canvas = document.createElement('canvas')
        canvas.width = 640
        canvas.height = 360
        const g = canvas.getContext('2d')!
        g.fillStyle = '#eef2f1'
        g.fillRect(0, 0, 640, 360)
        g.fillStyle = '#4caf93'
        g.fillRect(40, 40, 560, 60)
        g.fillStyle = '#1f2328'
        g.fillRect(80, 250, 200, 48)
        g.fillStyle = '#fff'
        g.font = 'bold 22px sans-serif'
        g.fillText('Checkout', 60, 80)
        g.fillText(' Pay', 120, 282)
        resolve({ mime: 'image/png', data: canvas.toDataURL('image/png').split(',')[1] })
      }, 600)
    )
}
/** Issue types in colours like a real space's settings, to check the labels stay readable. */
const TYPES: [string, string][] = [['Bug', '#f5a623'], ['Request', '#f8d34f'], ['Task', '#a8d66f'], ['Q&A', '#a1253f'], ['Other', '#8fd3f0'], ['Research', '#666665']]
extra['issues.list'] = () => {
  const { issues } = (requests as unknown as { 'issues.list': () => { issues: { type: string; typeColor: string | null }[] } })['issues.list']()
  return { issues: issues.map((r, i) => ({ ...r, type: TYPES[i % TYPES.length]![0], typeColor: TYPES[i % TYPES.length]![1] })), total: issues.length }
}

/** `&empty`: every list comes back empty, to see the empty states. */
const empty: Record<string, (input: never) => unknown> = flags.includes('empty')
  ? {
      'meta.get': () => ({ projects: [], statuses: [], priorities: [], users: [], resolutions: [], issueTypes: [], categories: [], versions: [] }),
      'issues.list': () => ({ issues: [], total: 0 }),
      'issues.count': () => ({ count: 0 }),
      'pullRequests.mine': () => [],
      'runs.get': () => [],
      'ai.history': () => ({ threads: [], usage: null })
    }
  : {}
extra['issue.update'] = () => extra['issue.get']!(undefined as never)
const handlers: Record<string, (input: never) => unknown> = {
  ...(requests as unknown as Record<string, (input: never) => unknown>),
  ...extra,
  ...empty,
  ...(screen === 'signedOut' ? (signedOutRequests as unknown as Record<string, (input: never) => unknown>) : {})
}

const stored: Record<string, unknown> = {
  'web.panel': {
    home: { screen: 'home', openKey: null },
    issues: { screen: 'issues', openKey: null, advancedOpen: true, filters: { projectId: '10' } },
    detail: { screen: 'home', openKey: 'SHOP-142' },
    ai: { screen: 'ai', openKey: null },
    settings: { screen: 'settings', openKey: null },
    signedOut: {}
  }[screen]
}

const noop = { dispose() {} }
;(globalThis as unknown as { orca: unknown }).orca = {
  plugin: {
    request: async (name: string, input?: unknown) => {
      const handler = handlers[name]
      await new Promise((r) => setTimeout(r, 120))
      return handler ? handler(input as never) : {}
    },
    on: () => noop
  },
  on: () => noop,
  shell: { openExternal: async () => ({ opened: true }) },
  storage: {
    get: async (key: string) => stored[key] ?? null,
    set: async (key: string, value: unknown) => void (stored[key] = value)
  }
}

void import('./panel.js')
