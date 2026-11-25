// Runs src/worker.ts's activate(orca) over a mock host, with Backlog's HTTP API stubbed.
import { afterEach, assert, mockHost, mountWorker, test } from 'orca/testing'
import { cliLauncher } from './orcaCli'
import * as main from './worker'

const realFetch = globalThis.fetch
const realLaunch = cliLauncher.launchWithPrompt
afterEach(() => {
  globalThis.fetch = realFetch
  cliLauncher.launchWithPrompt = realLaunch
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
function stubBacklog(): URL[] {
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
    '/api/v2/issues/APP-1/comments': [{ id: 9, content: 'ok', createdUser: { id: 8, name: 'Boss' }, created: issue.created }]
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
    { target: { workspaceId: 'w1' }, agent: 'claude', prompt: '/fixbug-backlog APP-1' },
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

test('saves changed fields with the comment, or posts the comment alone', async () => {
  stubBacklog()
  writes.length = 0
  const worker = await mountWorker(main, { host: saved() })
  await worker.request('auth.status')
  const detail = await worker.request('issue.get', { key: 'APP-1' })
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
