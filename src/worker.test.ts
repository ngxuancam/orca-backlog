// Runs src/worker.ts's activate(orca) over a mock host, with Backlog's HTTP API stubbed.
import { afterEach, assert, mockHost, mountWorker, test } from 'orca/testing'
import * as main from './worker'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
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
    '/api/v2/issues': [issue],
    '/api/v2/issues/count': { count: 1 },
    '/api/v2/issues/APP-1': issue,
    '/api/v2/issues/APP-1/comments': [{ id: 9, content: 'ok', createdUser: { id: 8, name: 'Boss' }, created: issue.created }]
  }
  globalThis.fetch = (async (input: string | URL) => {
    const url = new URL(String(input))
    seen.push(url)
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

test('the agent prompt names the skill and the issue', () => {
  const prompt = main.buildPrompt(issue as never, 'https://acme.backlog.com/view/APP-1', 'code-review')
  assert.match(prompt, /^Use the "code-review" skill/)
  assert.match(prompt, /APP-1: Fix login/)
  assert.match(prompt, /Attachments: shot\.png/)
})
