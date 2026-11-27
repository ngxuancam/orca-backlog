// Runs src/worker.ts's activate(orca) over a mock host, with Backlog's HTTP API stubbed.
import { afterEach, assert, mockHost, mountWorker, test } from 'orca/testing'
import { git, type GitRun } from './git'
import { cliLauncher } from './orcaCli'
import { picker } from './pick'
import { updateSource } from './updates'
import * as main from './worker'

const realFetch = globalThis.fetch
const realLaunch = cliLauncher.launchWithPrompt
const realGit = git.run
const realPicker = { ...picker }
const realCli = { ...cliLauncher }
const realUpdates = { ...updateSource }
const terminals: unknown[] = []
cliLauncher.openTerminal = async (w) => void terminals.push(w)
afterEach(() => {
  globalThis.fetch = realFetch
  cliLauncher.launchWithPrompt = realLaunch
  git.run = realGit
  Object.assign(picker, realPicker)
  Object.assign(cliLauncher, realCli)
  Object.assign(updateSource, realUpdates)
  cliLauncher.openTerminal = async (w) => void terminals.push(w)
  terminals.length = 0
})

const issue = {
  id: 1,
  projectId: 10,
  issueKey: 'APP-1',
  summary: 'Fix login',
  description: 'It breaks',
  issueType: { id: 1, name: 'Bug' },
  status: { id: 2, name: 'In Progress' },
  priority: { id: 2, name: 'High' },
  assignee: { id: 7, name: 'Me' },
  createdUser: { id: 8, name: 'Boss' },
  startDate: null,
  dueDate: '2026-12-01T00:00:00Z',
  created: '2026-11-01T00:00:00Z',
  updated: '2026-11-20T00:00:00Z',
  milestone: [],
  category: [],
  attachments: [{ id: 5, name: 'shot.png', size: 3 }]
}

/** Every change sent to Backlog: method, path and the form as sent. */
const writes: { method: string; path: string; form: string }[] = []

/** Answers Backlog paths and records every URL asked for. */
function stubBacklog(extra: Record<string, unknown> = {}): URL[] {
  const seen: URL[] = []
  const routes: Record<string, unknown> = {
    '/api/v2/projects': [{ id: 10, projectKey: 'APP', name: 'App' }],
    '/api/v2/projects/10/statuses': [
      { id: 1, name: 'Open' },
      { id: 2, name: 'In Progress' },
      { id: 4, name: 'Closed' }
    ],
    '/api/v2/priorities': [{ id: 2, name: 'High' }],
    '/api/v2/projects/10/users': [
      { id: 7, userId: 'me', name: 'Me' },
      { id: 11, userId: 'trangtth', name: 'Trang' },
      { id: 12, userId: 'trangttm6', name: 'Trang' }
    ],
    '/api/v2/issues': [issue],
    '/api/v2/issues/count': { count: 1 },
    '/api/v2/issues/APP-1': issue,
    '/api/v2/issues/APP-1/comments': [{ id: 9, content: 'ok', createdUser: { id: 8, name: 'Boss' }, created: issue.created }],
    ...extra
  }
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    seen.push(url)
    if (init?.method) writes.push({ method: init.method, path: url.pathname, form: String(init.body) })
    const body =
      url.pathname === '/api/v2/users/myself'
        ? url.host === 'acme.backlog.com'
          ? { id: 7, userId: 'me', name: 'Me' }
          : { id: 9, userId: 'me2', name: 'Other me' }
        : routes[url.pathname]
    return body === undefined
      ? new Response(JSON.stringify({ errors: [{ message: 'No such path' }] }), { status: 404 })
      : new Response(JSON.stringify(body), { status: 200 })
  }) as typeof fetch
  return seen
}

const ACME = 'acme.backlog.com.7'
const OTHER = 'other.backlog.jp.9'
const account = (id: string, space: string, name: string) => ({ id, space, name })

/** Two saved accounts; workspace w1 belongs to Orca project p1. */
const saved = (storage: Record<string, unknown> = {}) =>
  mockHost({
    storage: {
      accounts: [account(ACME, 'acme.backlog.com', 'Me'), account(OTHER, 'other.backlog.jp', 'Other me')],
      lastAccount: ACME,
      ...storage
    } as never,
    secrets: { [`apiKey.${ACME}`]: 'k', [`apiKey.${OTHER}`]: 'k2' },
    results: {
      'workspace.readContext': { workspaceId: 'w1', branch: 'main', displayName: 'repo', terminals: [] },
      'workspace.list': {
        workspaces: [{ id: 'w1', kind: 'worktree', name: 'main', project: 'Repo', projectId: 'p1', path: '/r', branch: 'main', hostId: 'local' }],
        truncated: false
      },
      'project.list': { projects: [{ id: 'p1', name: 'Repo', kind: 'git', hostId: 'local', path: '/r' }], truncated: false }
    }
  })

test('uses the last account when the Orca project has none', async () => {
  stubBacklog()
  const worker = await mountWorker(main, { host: saved() })
  const state = await worker.request('auth.status')
  assert.equal(state.session?.accountId, ACME)
  assert.equal(state.accounts.length, 2)
  assert.deepEqual(state.orcaProject, { value: 'p1', label: 'Repo' })
  assert.deepEqual(worker.refusals, [])
})

test('uses the account remembered for the Orca project', async () => {
  stubBacklog()
  const worker = await mountWorker(main, { host: saved({ projectAccounts: { p1: OTHER } }) })
  assert.equal((await worker.request('auth.status')).session?.space, 'other.backlog.jp')
})

test('switching account remembers it for the focused Orca project', async () => {
  stubBacklog()
  const host = saved()
  const worker = await mountWorker(main, { host })
  const state = await worker.request('account.use', { id: OTHER })
  assert.equal(state.session?.accountId, OTHER)
  assert.deepEqual(host.data().storage.projectAccounts, { p1: OTHER })
  assert.equal(worker.posts.at(-1)?.event, 'auth.changed')
  const settings = await worker.request('settings.map', { projectId: 'p1', accountId: '' })
  assert.deepEqual(settings.projects, [{ value: 'p1', label: 'Repo', accountId: '' }])
})

test('moves the single 0.1 login into the account list', async () => {
  stubBacklog()
  const host = mockHost({ storage: { space: 'acme.backlog.com' }, secrets: { apiKey: 'k' } })
  const worker = await mountWorker(main, { host })
  const state = await worker.request('auth.status')
  assert.equal(state.session?.accountId, ACME)
  assert.equal(host.data().secrets[`apiKey.${ACME}`], 'k')
  assert.equal(host.data().storage.space, undefined)
})

test('lists my issues that are not closed', async () => {
  const seen = stubBacklog()
  const worker = await mountWorker(main, { host: saved() })
  const page = await worker.request('issues.list', {
    projectId: '10',
    status: 'notClosed',
    sort: 'updated',
    order: 'desc',
    offset: 0
  })
  assert.equal(page.total, 1)
  assert.equal(page.issues[0]?.key, 'APP-1')
  const list = seen.find((u) => u.pathname === '/api/v2/issues')!
  assert.deepEqual(list.searchParams.getAll('assigneeId[]'), ['7'])
  assert.deepEqual(list.searchParams.getAll('statusId[]'), ['1', '2'])
  assert.equal(list.searchParams.get('apiKey'), 'k')
})

test('reads an issue with attachments and comments', async () => {
  stubBacklog()
  const worker = await mountWorker(main, { host: saved() })
  const detail = await worker.request('issue.get', { key: 'APP-1' })
  assert.equal(detail.url, 'https://acme.backlog.com/view/APP-1')
  assert.deepEqual(detail.attachments, [{ id: 5, name: 'shot.png', size: 3, kind: 'image' }])
  assert.equal(detail.comments[0]?.author, 'Boss')
})

test('login adds an account and tells open panels', async () => {
  stubBacklog()
  const host = saved({ accounts: [], lastAccount: null })
  const worker = await mountWorker(main, { host })
  const state = await worker.request('auth.login', { space: 'https://acme.backlog.com/', apiKey: ' k ' })
  assert.equal(state.session?.accountId, ACME)
  assert.deepEqual(host.data().storage.accounts, [account(ACME, 'acme.backlog.com', 'Me')])
  assert.equal(host.data().secrets[`apiKey.${ACME}`], 'k')
  assert.equal(worker.posts.at(-1)?.event, 'auth.changed')
})

test('a skill starts as its command; without one the agent gets a brief of the issue', async () => {
  stubBacklog()
  const host = saved()
  host.respond('agent.launch', { terminalId: 't1' })
  host.respond('workspace.open', { opened: true })
  host.respond('terminal.focus', { focused: true })
  const worker = await mountWorker(main, { host })
  await worker.request('auth.status')
  const prompt = async (agent: string, skill?: string) =>
    (await worker.request('launch.prompt', { key: 'APP-1', agent, ...(skill ? { skill } : {}) })).prompt
  assert.equal(await prompt('claude', 'fixbug-backlog'), '/fixbug-backlog APP-1')
  assert.equal(await prompt('codex', 'fixbug-backlog'), '$fixbug-backlog APP-1')
  const brief = await prompt('claude')
  assert.match(brief, /^Work on Backlog issue APP-1: Fix login/)
  assert.match(brief, /Attachments: shot\.png/)

  // Orca's CLI starts the agent with its prompt in one launch.
  const launched: unknown[] = []
  cliLauncher.launchWithPrompt = async (target, agent, prompt) => {
    launched.push({ target, agent, prompt })
    return { workspaceId: 'w1' }
  }
  await worker.request('launch.start', { key: 'APP-1', target: 'ws:w1', agent: 'claude', skill: 'fixbug-backlog' })
  await worker.request('launch.start', { key: 'APP-1', target: 'new:p1|local', agent: 'codex', prompt: '  Only fix the CSS  ' })
  assert.deepEqual(launched, [
    { target: { workspaceId: 'w1', path: '/r' }, agent: 'claude', prompt: '/fixbug-backlog APP-1' },
    { target: { projectId: 'p1', hostId: 'local', name: 'APP-1' }, agent: 'codex', prompt: 'Only fix the CSS' }
  ])
  assert.equal(host.callsOf('agent.launch').length, 0)

  // Each issue remembers its workspaces; ones Orca no longer has are dropped.
  const runs = await worker.request('runs.get', { key: 'APP-1' })
  assert.deepEqual(
    runs.map(({ workspaceId, label, branch, agent, skill }) => ({ workspaceId, label, branch, agent, skill })),
    [{ workspaceId: 'w1', label: 'Repo / main', branch: 'main', agent: 'codex', skill: undefined }]
  )
  assert.deepEqual(await worker.request('runs.get', { key: 'APP-2' }), [])
  await worker.request('runs.focus', { workspaceId: 'w1' })
  assert.deepEqual(host.callsOf('workspace.open').at(-1), { workspaceId: 'w1' })
  host.respond('workspace.list', { workspaces: [], truncated: false })
  assert.deepEqual(await worker.request('runs.get', { key: 'APP-1' }), [])
  assert.deepEqual(host.data().storage.issueRuns, {})
  host.respond('workspace.list', {
    workspaces: [{ id: 'w1', kind: 'worktree', name: 'main', project: 'Repo', projectId: 'p1', path: '/r', branch: 'main', hostId: 'local' }],
    truncated: false
  })

  // Without the CLI, the host API still starts it.
  cliLauncher.launchWithPrompt = async () => {
    throw new Error('orca not found')
  }
  await worker.request('launch.start', { key: 'APP-1', target: 'ws:w1', agent: 'claude', skill: 'fixbug-backlog' })
  assert.deepEqual(host.callsOf('agent.launch').at(-1), { workspaceId: 'w1', agent: 'claude', prompt: '/fixbug-backlog APP-1' })
  assert.deepEqual(host.callsOf('terminal.focus').at(-1), { terminalId: 't1' })
  assert.deepEqual(worker.refusals, [])
})

test('asks Backlog AI in a tab of the space, opening one when there is none', async () => {
  stubBacklog()
  const tabs = [{ browserPageId: 'other', url: 'https://example.com/', loaded: true }]
  const evals: { page: string; expression: string }[] = []
  const shown: string[] = []
  let answer: unknown = JSON.stringify({ ok: true, threadId: 'th-1', text: 'APP-1 is about login.', tools: ['search-issues-tool'], approval: null })
  cliLauncher.browserTabs = async () => tabs
  cliLauncher.createBrowserTab = async (url) => (tabs.push({ browserPageId: 'p1', url, loaded: true }), 'p1')
  cliLauncher.evalInTab = async (page, expression) => (evals.push({ page, expression }), answer)
  cliLauncher.showBrowserTab = async (page) => void shown.push(page)
  const worker = await mountWorker(main, { host: saved() })
  await worker.request('auth.status')
  const first = await worker.request('ai.ask', { question: ' Which issues are about login? ' })
  assert.deepEqual(first, { threadId: 'th-1', text: 'APP-1 is about login.', tools: ['search-issues-tool'], approval: null })
  // The tab is on the account's space; the question goes in the page script.
  assert.equal(tabs.at(-1)!.url, 'https://acme.backlog.com/dashboard')
  assert.equal(evals[0]!.page, 'p1')
  assert.match(evals[0]!.expression, /"question":"Which issues are about login\?"/)
  // A follow-up reuses that tab and the thread.
  await worker.request('ai.ask', { question: 'And the oldest?', threadId: 'th-1' })
  assert.equal(tabs.length, 2)
  assert.match(evals[1]!.expression, /"threadId":"th-1"/)
  // Signed out in Orca's browser: the tab comes forward and the panel is told why.
  answer = JSON.stringify({ ok: false, reason: 'login', status: 200 })
  await assert.rejects(worker.request('ai.ask', { question: 'Again' }), /Log in to acme\.backlog\.com in Orca's browser/)
  assert.deepEqual(shown, ['p1'])
  await assert.rejects(worker.request('ai.ask', { question: '   ' }), /Type a question/)
  const log = await worker.request('audit.list')
  assert.equal(log.filter((e) => e.action === 'Asked Backlog AI').length, 3)
  assert.deepEqual(worker.refusals, [])
})

test('Backlog AI: availability is remembered; history and a chat come from the space tab', async () => {
  stubBacklog()
  let status = JSON.stringify({ state: 'available' })
  let fetched: unknown = '[]'
  const evals: string[] = []
  cliLauncher.browserTabs = async () => [{ browserPageId: 'p1', url: 'https://acme.backlog.com/dashboard', loaded: true }]
  cliLauncher.evalInTab = async (_page, expression) => (evals.push(expression), expression.includes('chat-ui-loader') ? status : fetched)
  cliLauncher.showBrowserTab = async () => undefined
  const worker = await mountWorker(main, { host: saved() })
  await worker.request('auth.status')
  assert.deepEqual(await worker.request('ai.status', {}), { state: 'available' })
  status = JSON.stringify({ state: 'unavailable' })
  // Remembered: the page is not read again until a recheck.
  assert.deepEqual(await worker.request('ai.status', {}), { state: 'available' })
  assert.deepEqual(await worker.request('ai.status', { recheck: true }), { state: 'unavailable' })
  // Signed out says nothing about the plan.
  status = JSON.stringify({ state: 'signedOut' })
  assert.deepEqual(await worker.request('ai.status', { recheck: true }), { state: 'signedOut' })

  fetched = JSON.stringify([
    { status: 200, json: [{ id: 't1', title: 'Login bugs', updatedAt: '2026-11-20T00:00:00Z' }] },
    { status: 200, json: { availability: 'available', usagePercentage: 0.2 } }
  ])
  const history = await worker.request('ai.history')
  assert.deepEqual(history, { threads: [{ id: 't1', title: 'Login bugs', updated: Date.parse('2026-11-20T00:00:00Z') }], usage: { state: 'available', percent: 20 } })
  fetched = JSON.stringify([{ status: 200, json: { messages: [{ role: 'assistant', parts: [{ type: 'text', text: 'Hi' }] }, { role: 'user', parts: [{ type: 'text', text: 'hello' }] }] } }])
  const chat = await worker.request('ai.thread', { threadId: 't1' })
  assert.deepEqual(chat.turns.map((t) => [t.question, t.answer.text]), [['hello', 'Hi']])
  assert.match(evals.at(-1)!, /memory\/threads\/t1\/messages\?agentId=ai-assistant/)
  fetched = JSON.stringify([{ status: 401, json: null }])
  await assert.rejects(worker.request('ai.thread', { threadId: 't1' }), /Log in to acme\.backlog\.com/)
  assert.deepEqual(worker.refusals, [])
})

test('the web panel hands over pasted bytes and reads images to show inline', async () => {
  stubBacklog()
  const stubbed = globalThis.fetch
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) =>
    new URL(String(input)).pathname === '/api/v2/issues/APP-1/attachments/5'
      ? new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 })
      : stubbed(input, init)) as typeof fetch
  const worker = await mountWorker(main, { host: saved() })
  await worker.request('auth.status')
  const put = await worker.request('files.put', { name: '../../evil/paste.png', data: Buffer.from('png').toString('base64') })
  // The name loses any folder part; the file waits like a pasted one.
  assert.deepEqual([put.name, put.size, put.kind], ['paste.png', 3, 'image'])
  await assert.rejects(worker.request('files.put', { name: 'empty.png', data: '' }), /empty/)
  assert.deepEqual(await worker.request('files.drop', { ids: [put.id] }), { dropped: 1 })
  // shot.png is attachment 5 of APP-1 in the stub.
  assert.deepEqual(await worker.request('attachment.data', { key: 'APP-1', attachmentId: 5 }), { mime: 'image/png', data: Buffer.from([137, 80, 78, 71]).toString('base64') })
  await assert.rejects(worker.request('attachment.data', { key: 'APP-1', attachmentId: 99 }), /has no attachment 99/)
  assert.deepEqual(worker.refusals, [])
})

test('assigns a pull request it listed, and serves user icons once each', async () => {
  const pr = { id: 1, number: 7, summary: 'Fix login', branch: 'fix', base: 'main', status: { id: 1, name: 'Open' }, createdUser: null, assignee: { id: 7, name: 'Me' }, issue: { id: 1, issueKey: 'APP-1' }, updated: issue.updated }
  stubBacklog({
    '/api/v2/projects/10/git/repositories': [{ id: 5, name: 'app' }],
    '/api/v2/projects/10/git/repositories/5/pullRequests': [pr],
    '/api/v2/projects/10/git/repositories/5/pullRequests/7': pr
  })
  const stubbed = globalThis.fetch
  let iconCalls = 0
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) =>
    new URL(String(input)).pathname === '/api/v2/users/7/icon'
      ? (iconCalls++, new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } }))
      : stubbed(input, init)) as typeof fetch
  writes.length = 0
  const worker = await mountWorker(main, { host: saved() })
  await worker.request('auth.status')
  const [listed] = (await worker.request('issue.get', { key: 'APP-1' })).pullRequests
  assert.deepEqual([listed!.assignee, listed!.assigneeId, listed!.issueKey, listed!.projectId], ['Me', 7, 'APP-1', 10])
  await worker.request('pullRequest.assign', { key: listed!.key, assigneeId: 11 })
  assert.deepEqual(writes.at(-1), { method: 'PATCH', path: '/api/v2/projects/10/git/repositories/5/pullRequests/7', form: 'assigneeId=11' })
  await assert.rejects(worker.request('pullRequest.assign', { key: '9-9', assigneeId: 1 }), /not known yet/)
  const icon = await worker.request('user.icon', { userId: 7 })
  await worker.request('user.icon', { userId: 7 })
  assert.deepEqual(icon, { mime: 'image/png', data: Buffer.from([1, 2, 3]).toString('base64') })
  assert.equal(iconCalls, 1)
  assert.equal((await worker.request('audit.list'))[0]!.action, 'Assigned pull request')
  assert.deepEqual(worker.refusals, [])
})

test('the update item shows only when GitHub has a newer release; pressing it opens the notes', async () => {
  stubBacklog()
  const version = JSON.parse((await import('node:fs')).readFileSync('orca-plugin.json', 'utf8')).version as string
  const [major, minor, patch] = version.split('.').map(Number) as [number, number, number]
  let latest: { version: string; url: string } | null = { version: `${major}.${minor}.${patch + 1}`, url: 'https://github.com/ngxuancam/orca-backlog/releases/tag/next' }
  updateSource.latest = async () => latest
  const opened: string[] = []
  cliLauncher.openBrowserTab = async (url) => void opened.push(url)
  const host = saved()
  const worker = await mountWorker(main, { host })
  // Hidden from the start.
  assert.deepEqual(host.callsOf('statusBar.update')[0], { id: 'update', visible: false })
  const found = await worker.request('update.check')
  assert.deepEqual(found, { installed: version, newer: latest })
  assert.deepEqual(host.callsOf('statusBar.update').at(-1), {
    id: 'update',
    visible: true,
    text: `Backlog Tasks v${latest!.version}`,
    tooltip: `Backlog Tasks v${latest!.version} is out (you have v${version}). Press to see what is new.`
  })
  assert.match(String(await worker.command('backlog-tasks.openUpdate')), /release notes are open/)
  assert.deepEqual(opened, ['https://github.com/ngxuancam/orca-backlog/releases/tag/next'])
  // The same version, or none: hidden again.
  latest = { version, url: 'x' }
  assert.equal((await worker.request('update.check')).newer, null)
  assert.deepEqual(host.callsOf('statusBar.update').at(-1), { id: 'update', visible: false })
  assert.deepEqual(worker.refusals, [])
})

test('images in a comment follow the project formatting; other files only attach', () => {
  assert.equal(main.withFiles('See', ['a.png', 'b.pdf'], 'markdown'), 'See\n\n![image][a.png]')
  assert.equal(main.withFiles('', ['a.png', 'c.jpg'], 'backlog'), '#image(a.png)\n#image(c.jpg)')
  assert.equal(main.withFiles(' ', ['b.pdf'], 'markdown'), 'Attached b.pdf')
})

test('uploads pasted and chosen files, then comments with their ids; the pasted copy is deleted', async () => {
  const { mkdtempSync, writeFileSync, existsSync, rmSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const dir = mkdtempSync(join(tmpdir(), 'bt-files-'))
  try {
    const log = join(dir, 'log.txt')
    writeFileSync(log, 'hello')
    picker.choose = async () => [log]
    stubBacklog({ '/api/v2/projects/APP': { id: 10, projectKey: 'APP', textFormattingRule: 'markdown' } })
    const stubbed = globalThis.fetch
    const uploaded: string[] = []
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      if (new URL(String(input)).pathname === '/api/v2/space/attachment') {
        const file = (init!.body as FormData).get('file') as File
        uploaded.push(`${file.name}:${await file.text()}`)
        return new Response(JSON.stringify({ id: 30 + uploaded.length, name: file.name, size: file.size }), { status: 200 })
      }
      return stubbed(input, init)
    }) as typeof fetch
    writes.length = 0
    const worker = await mountWorker(main, { host: saved() })
    await worker.request('auth.status')
    // A screenshot pasted into the comment: the panel hands over its bytes.
    const pasted = await worker.request('files.put', { name: 'paste-1.png', data: Buffer.from('png').toString('base64') })
    assert.deepEqual([pasted.name, pasted.size, pasted.kind], ['paste-1.png', 3, 'image'])
    const { readdirSync } = await import('node:fs')
    const { pasteFolder } = await import('./pick')
    const before = readdirSync(pasteFolder()).filter((n) => n.startsWith('put-')).length
    const chosen = await worker.request('files.choose')
    assert.deepEqual(chosen.map((f) => [f.name, f.kind]), [['log.txt', 'file']])
    await worker.request('issue.update', { key: 'APP-1', changes: { comment: 'Screenshot', files: [pasted.id, chosen[0]!.id] } })
    assert.deepEqual(uploaded, ['paste-1.png:png', 'log.txt:hello'])
    assert.deepEqual(writes, [
      {
        method: 'POST',
        path: '/api/v2/issues/APP-1/comments',
        form: `content=${new URLSearchParams({ c: 'Screenshot\n\n![image][paste-1.png]' }).toString().slice(2)}&attachmentId%5B%5D=31&attachmentId%5B%5D=32`
      }
    ])
    // The pasted copy is gone; the chosen file is the person's own and stays.
    assert.equal(readdirSync(pasteFolder()).filter((n) => n.startsWith('put-')).length, before - 1)
    assert.equal(existsSync(log), true)
    const [entry] = await worker.request('audit.list')
    assert.equal(entry!.api, 'POST /api/v2/space/attachment, POST /api/v2/issues/APP-1/comments')
    assert.match(entry!.details ?? "", /attached paste-1\.png, log\.txt/)
    // A file the worker no longer holds (it restarted) is refused before anything is sent.
    await assert.rejects(worker.request('issue.update', { key: 'APP-1', changes: { files: ['file-9'] } }), /no longer waiting/)
    assert.deepEqual(worker.refusals, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('saves changed fields with the comment, or posts the comment alone', async () => {
  stubBacklog()
  writes.length = 0
  const worker = await mountWorker(main, { host: saved() })
  await worker.request('auth.status')
  const detail = await worker.request('issue.get', { key: 'APP-1' })
  assert.equal(detail.assignee, 'Me')
  const [listed] = (await worker.request('issues.list', { status: 'notClosed', sort: 'assignee', order: 'asc', offset: 0 })).issues
  assert.deepEqual(
    { assignee: listed!.assignee, createdUser: listed!.createdUser, created: listed!.created, category: listed!.category, version: listed!.version },
    { assignee: 'Me', createdUser: 'Boss', created: Date.parse('2026-11-01T00:00:00Z'), category: '', version: '' }
  )
  assert.equal(detail.fields.statusId, '2')
  assert.equal(detail.fields.assigneeId, '7')
  assert.equal(detail.fields.dueDate, '2026-12-01')

  await worker.request('issue.update', { key: 'APP-1', changes: { comment: '  On it  ' } })
  await worker.request('issue.update', {
    key: 'APP-1',
    changes: { statusId: '3', assigneeId: '', categoryIds: [], milestoneIds: ['5', '6'], dueDate: '', comment: 'Fixed' }
  })
  assert.deepEqual(writes, [
    { method: 'POST', path: '/api/v2/issues/APP-1/comments', form: 'content=On+it' },
    {
      method: 'PATCH',
      path: '/api/v2/issues/APP-1',
      form: 'statusId=3&assigneeId=&categoryId%5B%5D=&milestoneId%5B%5D=5&milestoneId%5B%5D=6&dueDate=&comment=Fixed'
    }
  ])
  await assert.rejects(worker.request('issue.update', { key: 'APP-1', changes: {} }), /Nothing to save/)
  await assert.rejects(worker.request('issue.update', { key: 'APP-1', changes: { dueDate: '1/12/2026' } }), /yyyy-MM-dd/)
  await assert.rejects(worker.request('issue.update', { key: 'APP-1', changes: { summary: ' ' } }), /summary cannot be empty/)
  assert.equal(writes.length, 2)

  // Each change is in the audit log with the API that made it; a refused one too.
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ errors: [{ message: 'No permission' }] }), { status: 403 })) as typeof fetch
  await assert.rejects(worker.request('issue.update', { key: 'APP-1', changes: { priorityId: '3' } }), /No permission/)
  const log = await worker.request('audit.list')
  assert.deepEqual(
    log.map(({ action, api, target, details, space, ok, error }) => ({ action, api, target, details, space, ok, error })),
    [
      { action: 'Updated issue', api: 'PATCH /api/v2/issues/APP-1', target: 'APP-1', details: 'priority → 3', space: 'acme.backlog.com', ok: false, error: 'Backlog 403: No permission' },
      {
        action: 'Updated issue',
        api: 'PATCH /api/v2/issues/APP-1',
        target: 'APP-1',
        details: 'status → 3; assignee → (none); category → (none); milestone → 5, 6; due date → (none); comment "Fixed"',
        space: 'acme.backlog.com',
        ok: true,
        error: undefined
      },
      { action: 'Commented on issue', api: 'POST /api/v2/issues/APP-1/comments', target: 'APP-1', details: 'comment "On it"', space: 'acme.backlog.com', ok: true, error: undefined }
    ]
  )
  assert.ok(!JSON.stringify(log).includes('apiKey'), 'no key in the log')
  const cleared = await worker.request('audit.clear')
  assert.deepEqual(cleared.map((e) => [e.action, e.details]), [['Cleared the audit log', '3 entries']])
})

test('collects the issue\'s web links, once each, and refuses other schemes', () => {
  const pr = { url: 'https://acme.backlog.com/git/APP/app/pullRequests/7', number: 7, summary: 'Fix login' } as never
  const links = main.linksIn(
    'https://acme.backlog.com/view/APP-1',
    [pr],
    'See [the spec](https://docs.example.com/spec?id=3). Also https://docs.example.com/spec?id=3, and file:///etc/passwd',
    ['Logs: https://logs.example.com/run/9.', 'Same PR https://acme.backlog.com/git/APP/app/pullRequests/7']
  )
  assert.deepEqual(
    links.map((l) => [l.from, l.url]),
    [
      ['issue', 'https://acme.backlog.com/view/APP-1'],
      ['pull request', 'https://acme.backlog.com/git/APP/app/pullRequests/7'],
      ['description', 'https://docs.example.com/spec?id=3'],
      ['comment', 'https://logs.example.com/run/9']
    ]
  )
  assert.throws(() => main.webUrl('javascript:alert(1)'), /Not a web link/)
})

test('members who share a name are told apart by their login', async () => {
  stubBacklog()
  const worker = await mountWorker(main, { host: saved() })
  const meta = await worker.request('meta.get', { projectId: '10' })
  assert.deepEqual(
    meta.users.map((u) => u.label),
    ['Me', 'Trang (trangtth)', 'Trang (trangttm6)']
  )
})

test('finds backlog-mcp-server entries on this machine and signs in with a chosen one', async () => {
  const { mkdtemp, mkdir, rm, writeFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const home = await mkdtemp(join(tmpdir(), 'orca-backlog-home-'))
  const workspace = join(home, 'repo')
  await mkdir(workspace)
  const env = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, APPDATA: process.env.APPDATA }
  Object.assign(process.env, { HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData') })
  try {
    const server = (domain: string, key: string) => ({ command: 'npx', env: { BACKLOG_DOMAIN: domain, BACKLOG_API_KEY: key } })
    await writeFile(join(home, '.claude.json'), JSON.stringify({ mcpServers: { backlog: server('nope.backlog.com', 'bad1') } }))
    await writeFile(join(workspace, '.mcp.json'), JSON.stringify({ mcpServers: { backlog: server('https://acme.backlog.com/', 'k') } }))
    stubBacklog()
    globalThis.fetch = ((original) => async (input: string | URL) =>
      new URL(String(input)).host === 'nope.backlog.com'
        ? new Response(JSON.stringify({ errors: [{ message: 'Authentication failure' }] }), { status: 401 })
        : original(input))(globalThis.fetch) as typeof fetch
    const host = mockHost({
      results: {
        'workspace.readContext': { workspaceId: 'w1', branch: 'main', displayName: 'repo', terminals: [] },
        'workspace.list': {
          workspaces: [{ id: 'w1', kind: 'worktree', name: 'main', project: 'Repo', projectId: 'p1', path: workspace, branch: 'main', hostId: 'local' }],
          truncated: false
        }
      }
    })
    const worker = await mountWorker(main, { host })
    // With no account, the first entry that works is imported on its own.
    assert.equal((await worker.request('auth.status')).session?.accountId, ACME)
    const found = await worker.request('credentials.found')
    assert.deepEqual(
      found.map(({ space, file, keyHint, saved: isSaved, error }) => ({ space, file, keyHint, saved: isSaved, error })),
      [
        { space: 'nope.backlog.com', file: join('~', '.claude.json'), keyHint: '…bad1', saved: false, error: 'Backlog 401: Authentication failure' },
        { space: 'acme.backlog.com', file: join('~', 'repo', '.mcp.json'), keyHint: '…k', saved: true, error: undefined }
      ]
    )
    assert.ok(!JSON.stringify(found).includes('"bad1"'), 'keys stay in the worker')
    await assert.rejects(worker.request('credentials.use', { id: found[0]!.id }), /Authentication failure/)
    const state = await worker.request('credentials.use', { id: found[1]!.id })
    assert.equal(state.session?.accountId, ACME)
  } finally {
    for (const [name, value] of Object.entries(env)) value === undefined ? delete process.env[name] : (process.env[name] = value)
    await rm(home, { recursive: true, force: true })
  }
})

test('lists my open pull requests and checks them for conflicts in a local clone', async () => {
  const pr = (number: number, branch: string, status = { id: 1, name: 'Open' }) => ({
    id: number,
    number,
    summary: `PR ${number}`,
    branch,
    base: 'main',
    status,
    createdUser: { id: 7, name: 'Me' },
    updated: `2026-11-2${number}T00:00:00Z`
  })
  const seen = stubBacklog({
    '/api/v2/projects/10/git/repositories': [
      { id: 3, name: 'web', httpUrl: 'https://acme.backlog.com/git/APP/web.git', sshUrl: 'acme@acme.git.backlog.com:/APP/web.git' }
    ],
    '/api/v2/projects/10/git/repositories/3/pullRequests': [pr(1, 'fix/a'), pr(2, 'fix/b')]
  })
  const calls: string[][] = []
  git.run = (async (dir, args) => {
    calls.push([dir, ...args])
    if (args[0] === 'remote') return { code: 0, stdout: 'origin\tacme@acme.git.backlog.com:/APP/web.git (fetch)\n', stderr: '' }
    if (args[0] === 'fetch') return { code: 0, stdout: '', stderr: '' }
    const clash = args.includes('refs/remotes/origin/fix/b')
    return { code: clash ? 1 : 0, stdout: clash ? 'tree\nsrc/a.ts\n' : 'tree\n', stderr: '' }
  }) as GitRun
  const worker = await mountWorker(main, { host: saved() })
  await worker.request('auth.status')
  const mine = await worker.request('pullRequests.mine')
  assert.deepEqual(mine.map((p) => [p.key, p.project]), [['3-2', 'App (APP)'], ['3-1', 'App (APP)']])
  const asked = seen.find((u) => u.pathname.endsWith('/repositories/3/pullRequests'))!
  assert.deepEqual(asked.searchParams.getAll('statusId[]'), ['1'])
  assert.deepEqual(asked.searchParams.getAll('createdUserId[]'), ['7'])
  const checks = await worker.request('pullRequests.conflicts', { keys: ['3-1', '3-2', '9-9'] })
  assert.deepEqual(checks['3-1'], { state: 'clean' })
  assert.deepEqual(checks['3-2'], { state: 'conflict', files: ['src/a.ts'] })
  assert.equal(checks['9-9']?.state, 'unknown')
  // Only the PR's two branches are fetched, in the workspace's folder; nothing else runs.
  assert.deepEqual(calls.find((c) => c[1] === 'fetch'), [
    '/r', 'fetch', '--no-tags', '--quiet', 'origin', '+refs/heads/main:refs/remotes/origin/main', '+refs/heads/fix/a:refs/remotes/origin/fix/a'
  ])
  assert.deepEqual([...new Set(calls.map((c) => c[1]))], ['remote', 'fetch', 'merge-tree'])
})

test('links an existing worktree to an issue; pressing it shows its terminal, or opens one', async () => {
  stubBacklog()
  const host = saved()
  host.respond('workspace.open', { opened: true })
  host.respond('terminal.focus', { focused: true })
  host.respond('terminal.list', { terminals: [], truncated: false })
  const worker = await mountWorker(main, { host })
  await worker.request('auth.status')
  const runs = await worker.request('runs.link', { key: 'APP-1', workspaceId: 'w1' })
  assert.deepEqual(
    runs.map(({ workspaceId, label, agent, linked }) => ({ workspaceId, label, agent, linked })),
    [{ workspaceId: 'w1', label: 'Repo / main', agent: '', linked: true }]
  )
  await assert.rejects(worker.request('runs.link', { key: 'APP-1', workspaceId: 'gone' }), /gone/)
  // No terminal in it: one opens there, through the CLI.
  await worker.request('runs.focus', { workspaceId: 'w1' })
  assert.deepEqual(host.callsOf('workspace.open').at(-1), { workspaceId: 'w1' })
  assert.deepEqual(terminals, [{ id: 'w1', path: '/r' }])
  // A terminal already there is focused instead.
  host.respond('terminal.list', { terminals: [{ id: 't9' }], truncated: false })
  await worker.request('runs.focus', { workspaceId: 'w1' })
  assert.deepEqual(host.callsOf('terminal.focus').at(-1), { terminalId: 't9' })
  assert.equal(terminals.length, 1)
  assert.deepEqual(await worker.request('runs.unlink', { key: 'APP-1', workspaceId: 'w1' }), [])
  assert.deepEqual(
    (await worker.request('audit.list')).map((e) => e.action).slice(0, 3),
    ['Unlinked worktree', 'Linked worktree', 'Linked worktree']
  )
  assert.deepEqual(worker.refusals, [])
})
