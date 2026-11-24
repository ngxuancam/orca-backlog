// `orca plugin test .` runs this in Node with the same runtime and checks Orca uses.
import { afterEach, assert, mockHost, mount, test, type TestPanel } from 'orca/testing'
import * as panel from './panel'
import { toneOfColor } from './panel'
import type { AuthState, IssueDetail, Session } from './protocol'

let view: TestPanel | undefined
afterEach(() => view?.unmount())

const session: Session = { accountId: 'a1', space: 'acme.backlog.com', me: { id: 7, name: 'Me', userId: 'me' } }
const accounts = [{ id: 'a1', space: 'acme.backlog.com', name: 'Me' }]
const state = (s: Session | null): AuthState => ({ session: s, accounts: s ? accounts : [], orcaProject: null })
const row = { key: 'APP-1', summary: 'Fix login', status: 'Open', statusId: 1, priority: 'High', type: 'Bug', typeColor: '#ea733b', due: null, updated: 0 }
const detail: IssueDetail = {
  ...row,
  url: 'https://acme.backlog.com/view/APP-1',
  projectId: 10,
  description: 'It breaks',
  assignee: 'Me',
  createdUser: 'Boss',
  created: 0,
  startDate: null,
  milestones: [],
  categories: [],
  attachments: [{ id: 5, name: 'shot.png', size: 2048, kind: 'image' }],
  comments: [],
  parent: { key: 'APP-0', summary: 'Epic', status: 'Open', statusId: 1 },
  children: [],
  related: [],
  pullRequests: [
    {
      key: '1-7',
      number: 7,
      summary: 'Fix login',
      repo: 'app',
      branch: 'fix/APP-1',
      base: 'main',
      status: 'Open',
      statusId: 1,
      author: 'Me',
      updated: 0,
      url: 'https://acme.backlog.com/git/APP/app/pullRequests/7'
    }
  ]
}

let started: unknown
let lastQuery: unknown
function host(signedIn: boolean, extra: Record<string, (input: never) => unknown> = {}) {
  return mockHost({
    requests: {
      'auth.status': () => state(signedIn ? session : null),
      'auth.login': () => state(session),
      'meta.get': () => ({ projects: [{ value: '10', label: 'App (APP)' }], statuses: [], priorities: [], users: [], resolutions: [], issueTypes: [], categories: [], versions: [] }),
      'issues.list': (q) => ((lastQuery = q), { issues: [row], total: 1 }),
      'issues.count': () => ({ count: 1 }),
      'issue.get': () => detail,
      'launch.options': () => ({
        targets: [{ value: 'ws:w1', label: 'repo / main' }],
        agents: [{ value: 'claude', label: 'Claude' }],
        skills: [{ value: 'code-review', label: 'code-review', providers: ['claude'] }],
        focused: 'ws:w1',
        defaultAgent: 'claude'
      }),
      'launch.start': (input) => ((started = input), { workspaceId: 'w1' }),
      'attachment.open': () => ({ path: 'x/shot.png', mode: 'preview' }),
      ...extra
    }
  })
}

test('asks for a space and key when no login is found', async () => {
  view = await mount(panel, { host: host(false) })
  assert.ok(view.find({ label: 'API key' }))
  await view.type({ label: 'Space' }, 'acme.backlog.com')
  await view.type({ label: 'API key' }, 'k', { submit: true })
  assert.ok(view.find({ role: 'button', text: /^Assigned to me/ }))
  assert.deepEqual(view.errors, [])
})

test('opens a project with its filter set', async () => {
  view = await mount(panel, { host: host(true) })
  await view.settled()
  assert.ok(view.find({ role: 'button', text: 'Assigned to me 1' }))
  await view.press({ text: 'App (APP)' })
  assert.equal((lastQuery as { projectId?: string }).projectId, '10')
  assert.equal((lastQuery as { assignee?: string }).assignee, 'me')
  await view.select({ label: 'Assignee' }, 'all')
  assert.equal((lastQuery as { assignee?: string }).assignee, 'all')
  await view.press({ role: 'button', text: '← Back' })
  assert.ok(view.find({ role: 'button', text: /^Assigned to me/ }))
  assert.deepEqual(view.errors, [])
})

test('lists my issues, opens one and starts an agent with the last skill', async () => {
  view = await mount(panel, { host: host(true) })
  await view.settled()
  assert.deepEqual(view.rowsOf({ type: 'Table' }), ['APP-1'])
  await view.activateRow({ type: 'Table' }, 'APP-1')
  assert.ok(view.find({ text: 'Fix login' }))
  assert.ok(view.find({ text: /#7 Fix login/ }))
  assert.ok(view.find({ text: /APP-0 Epic/ }))
  await view.select({ label: 'Skill' }, 'code-review')
  await view.press({ role: 'button', text: 'Start agent' })
  assert.deepEqual(started, {
    key: 'APP-1',
    target: 'ws:w1',
    agent: 'claude',
    skill: 'code-review'
  })
  assert.deepEqual(view.persisted.plugin.launchChoice, { target: 'ws:w1', agent: 'claude', skill: 'code-review' })
  assert.deepEqual(view.refusals, [])
  assert.deepEqual(view.errors, [])
})

test('settings lists accounts and maps an Orca project to one', async () => {
  let mapped: unknown
  const settings = () => ({ accounts, projects: [{ value: 'p1', label: 'Repo', accountId: '' }] })
  view = await mount(panel, {
    host: host(true, {
      'settings.get': settings,
      'settings.map': (input) => ((mapped = input), settings())
    })
  })
  await view.settled()
  await view.press({ label: 'Settings' })
  assert.ok(view.find({ text: 'acme.backlog.com' }))
  await view.select({ label: 'Repo' }, 'a1')
  assert.deepEqual(mapped, { projectId: 'p1', accountId: 'a1' })
  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.refusals, [])
})

test('advanced filters narrow the list and reset with the project', async () => {
  view = await mount(panel, {
    host: host(true),
    persisted: { plugin: { screen: 'issues', advancedOpen: true, issueFilters: { projectId: '10' } } }
  })
  await view.settled()
  await view.toggle({ label: 'Attached' })
  assert.equal((lastQuery as { attachment?: boolean }).attachment, true)
  await view.select({ label: 'Subtasking' }, '1')
  assert.equal((lastQuery as { parentChild?: string }).parentChild, '1')
  assert.ok(view.find({ role: 'button', text: 'Hide filters (2)' }))
  await view.press({ role: 'button', text: 'Clear' })
  assert.equal((lastQuery as { attachment?: boolean }).attachment, undefined)
  assert.deepEqual(view.errors, [])
})

test('image references in issue text open the preview', async () => {
  let opened: unknown
  view = await mount(panel, {
    host: host(true, {
      'issue.get': () => ({ ...detail, description: 'Before\n\n![shot.png](attachment:5)\n\nAfter' }),
      'attachment.open': (input) => ((opened = input), { path: 'x', mode: 'preview' })
    }),
    persisted: { plugin: { openKey: 'APP-1' } }
  })
  await view.settled()
  assert.ok(view.find({ text: 'After' }))
  await view.press({ role: 'button', text: 'Open preview · shot.png' })
  assert.deepEqual(opened, { key: 'APP-1', attachmentId: 5 })
  assert.deepEqual(view.errors, [])
})

test('a Select never gets more than 500 options', async () => {
  const many = Array.from({ length: 700 }, (_, i) => ({ value: String(i + 100), label: `User ${i}` }))
  view = await mount(panel, {
    host: host(true, {
      'meta.get': () => ({ projects: [{ value: '10', label: 'App (APP)' }], statuses: [], priorities: [], users: many, resolutions: [], issueTypes: [], categories: [], versions: [] })
    }),
    persisted: { plugin: { screen: 'issues', openKey: null } }
  })
  await view.settled()
  type Node = { props?: { label?: string; options?: unknown[] }; children?: unknown[] }
  const find = (node: unknown): Node | null => {
    if (!node || typeof node !== 'object') return null
    const n = node as Node
    if (n.props?.label === 'Assignee' && Array.isArray(n.props.options)) return n
    for (const child of n.children ?? []) {
      const hit = find(child)
      if (hit) return hit
    }
    return null
  }
  const assignee = find(view.tree())
  assert.ok(assignee, 'assignee select drawn')
  assert.equal(assignee!.props!.options!.length, 500)
  assert.deepEqual(view.errors, [])
})

test('issue type colours map to the nearest Orca tone', () => {
  assert.equal(toneOfColor('#ea733b'), 'warning') // orange
  assert.equal(toneOfColor('#e30000'), 'danger')
  assert.equal(toneOfColor('#a1af2f'), 'success') // olive green
  assert.equal(toneOfColor('#990000'), 'danger')
  assert.equal(toneOfColor('#666666'), 'neutral')
  assert.equal(toneOfColor('#3b9dbd'), 'neutral') // blue
  assert.equal(toneOfColor(null), 'neutral')
})
