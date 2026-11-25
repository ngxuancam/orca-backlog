// `orca plugin test .` runs this in Node with the same runtime and checks Orca uses.
import { afterEach, assert, mockHost, mount, test, type TestPanel } from 'orca/testing'
import * as panel from './panel'
import { toneOfColor } from './panel'
import type { AuditEntry, AuthState, IssueDetail, IssueRun, Session } from './protocol'

let view: TestPanel | undefined
afterEach(() => view?.unmount())

const session: Session = { accountId: 'a1', space: 'acme.backlog.com', me: { id: 7, name: 'Me', userId: 'me' } }
const accounts = [{ id: 'a1', space: 'acme.backlog.com', name: 'Me' }]
const state = (s: Session | null): AuthState => ({ session: s, accounts: s ? accounts : [], orcaProject: null })
const row = {
  key: 'APP-1',
  summary: 'Fix login',
  status: 'Open',
  statusId: 1,
  priority: 'High',
  type: 'Bug',
  typeColor: '#ea733b',
  due: null,
  updated: 0,
  assignee: 'Me',
  createdUser: 'Boss',
  updatedUser: 'Me',
  created: 0,
  startDate: null,
  category: 'Auth',
  milestone: '',
  version: '',
  resolution: '',
  estimatedHours: 2,
  actualHours: null
}
const detail: IssueDetail = {
  ...row,
  url: 'https://acme.backlog.com/view/APP-1',
  links: [
    { url: 'https://acme.backlog.com/view/APP-1', label: 'This issue in Backlog', from: 'issue' },
    { url: 'https://acme.backlog.com/git/APP/app/pullRequests/7', label: '#7 Fix login', from: 'pull request' },
    { url: 'https://status.example.com/incidents/42', label: 'status.example.com/incidents/42', from: 'comment' }
  ],
  projectId: 10,
  fields: {
    summary: 'Fix login',
    description: 'It breaks',
    statusId: '1',
    resolutionId: '',
    assigneeId: '7',
    priorityId: '2',
    issueTypeId: '1',
    categoryIds: [],
    milestoneIds: [],
    versionIds: [],
    startDate: '',
    dueDate: '',
    estimatedHours: '',
    actualHours: ''
  },
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
let focused: unknown
const linkCalls: unknown[] = []
let auditRows: AuditEntry[] = [
  { id: 'a1', at: 0, action: 'Updated issue', api: 'PATCH /api/v2/issues/APP-1', target: 'APP-1', details: 'status → 3', space: 'acme.backlog.com', ok: true }
]
let runs: IssueRun[] = []
let lastQuery: unknown
function host(signedIn: boolean, extra: Record<string, (input: never) => unknown> = {}) {
  return mockHost({
    requests: {
      'auth.status': () => state(signedIn ? session : null),
      'auth.login': () => state(session),
      'meta.get': () => ({
        projects: [{ value: '10', label: 'App (APP)' }],
        statuses: [{ value: '1', label: 'Open' }, { value: '2', label: 'In Progress' }],
        priorities: [{ value: '2', label: 'High' }],
        users: [{ value: '7', label: 'Me' }, { value: '8', label: 'Boss' }],
        resolutions: [],
        issueTypes: [{ value: '1', label: 'Bug' }],
        categories: [],
        versions: []
      }),
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
      'launch.prompt': (input: { key: string; skill?: string }) => ({
        prompt: input.skill ? `/${input.skill} ${input.key}` : `Work on Backlog issue ${input.key}: Fix login`
      }),
      'launch.start': (input) => ((started = input), { workspaceId: 'w1' }),
      'attachment.open': () => ({ path: 'x/shot.png', mode: 'preview' }),
      'credentials.found': () => [],
      'link.copy': (input) => (linkCalls.push(['copy', input]), { copied: true }),
      'link.openInOrca': (input) => (linkCalls.push(['orca', input]), { opened: true }),
      'audit.list': () => auditRows,
      'audit.clear': () => (auditRows = [{ ...auditRows[0]!, id: 'c', action: 'Cleared the audit log', details: '1 entries' }]),
      'runs.get': () => runs,
      'runs.focus': (input) => ((focused = input), { opened: true }),
      ...extra
    }
  })
}

test('signs in with a credential found on this computer', async () => {
  let used: unknown
  const found = [
    { id: 'c1', space: 'nope.backlog.com', file: '~/.claude.json', keyHint: '…bad1', saved: false, error: 'Backlog 401: Authentication failure' },
    { id: 'c2', space: 'acme.backlog.com', file: '~/repo/.mcp.json', keyHint: '…abcd', saved: false }
  ]
  view = await mount(panel, {
    host: host(false, { 'credentials.found': () => found, 'credentials.use': (input) => ((used = input), state(session)) })
  })
  await view.settled()
  const shown = JSON.stringify(view.tree())
  assert.match(shown, /Authentication failure/)
  assert.match(shown, /~\/repo\/\.mcp\.json · key …abcd/)
  await view.press({ text: /^acme\.backlog\.com/ })
  assert.deepEqual(used, { id: 'c2' })
  assert.ok(view.find({ role: 'button', text: /^Assigned to me/ }))
  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.refusals, [])
})

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
  assert.equal(view.valueOf({ label: 'Prompt' }), 'Work on Backlog issue APP-1: Fix login')
  assert.equal(view.find({ label: 'Worktrees' }), null)
  await view.select({ label: 'Skill' }, 'code-review')
  assert.equal(view.valueOf({ label: 'Sent to the agent' }), '/code-review APP-1')
  await view.press({ role: 'button', text: 'Start agent' })
  assert.deepEqual(started, {
    key: 'APP-1',
    target: 'ws:w1',
    agent: 'claude',
    skill: 'code-review',
    prompt: '/code-review APP-1'
  })
  assert.deepEqual(view.persisted.plugin.launchChoice, { target: 'ws:w1', agent: 'claude', skill: 'code-review' })
  // The launch is listed under Worktrees; pressing it shows that workspace.
  runs = [{ workspaceId: 'w1', label: 'repo / main', branch: 'main', agent: 'claude', skill: 'code-review', startedAt: 0 }]
  await view.press({ role: 'button', text: 'Start agent' })
  await view.press({ text: /^repo \/ main/ })
  assert.deepEqual(focused, { workspaceId: 'w1' })
  runs = []
  // An edited prompt survives a change of skill, until it is reset.
  await view.type({ label: 'Sent to the agent' }, ' only the CSS')
  await view.select({ label: 'Skill' }, 'none')
  assert.equal(view.valueOf({ label: 'Prompt' }), '/code-review APP-1 only the CSS')
  await view.press({ role: 'button', text: 'Reset prompt' })
  assert.equal(view.valueOf({ label: 'Prompt' }), 'Work on Backlog issue APP-1: Fix login')
  assert.deepEqual(view.refusals, [])
  assert.deepEqual(view.errors, [])
})

test('comments and changes fields in one save; a comment alone is a comment', async () => {
  const updates: unknown[] = []
  view = await mount(panel, {
    host: host(true, {
      'issue.update': (input: { key: string; changes: { comment?: string } }) => {
        updates.push(input)
        const { comment: _, ...fields } = input.changes
        return { ...detail, fields: { ...detail.fields, ...fields } }
      }
    })
  })
  await view.settled()
  await view.activateRow({ type: 'Table' }, 'APP-1')
  // The sheet at the bottom opens on demand; the summary is not part of it.
  assert.equal(view.find({ label: 'Comment' }), null)
  await view.press({ role: 'button', text: 'Update issue' })
  assert.equal(view.find({ label: 'Summary' }), null)
  assert.equal(view.find({ role: 'button', text: 'Comment' })?.props.disabled, true)
  await view.type({ label: 'Comment' }, 'Looking into it')
  await view.press({ role: 'button', text: 'Comment' })
  await view.select({ label: 'Status' }, '2')
  await view.select({ label: 'Assignee' }, 'none')
  await view.type({ label: 'Comment' }, 'Done on my side')
  await view.press({ role: 'button', text: 'Save 2 changes and comment' })
  assert.deepEqual(updates, [
    { key: 'APP-1', changes: { comment: 'Looking into it' } },
    { key: 'APP-1', changes: { statusId: '2', assigneeId: '', comment: 'Done on my side' } }
  ])
  // The form starts again from what Backlog answered.
  assert.equal(view.valueOf({ label: 'Comment' }), '')
  assert.equal(view.valueOf({ label: 'Status' }), '2')
  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.refusals, [])
})

test('the header edits the summary and description in place, apart from the sheet', async () => {
  const updates: unknown[] = []
  view = await mount(panel, {
    host: host(true, {
      'issue.update': (input: { key: string; changes: { comment?: string; summary?: string } }) => {
        updates.push(input)
        const { comment: _, ...fields } = input.changes
        return { ...detail, summary: fields.summary ?? detail.summary, fields: { ...detail.fields, ...fields } }
      }
    }),
    persisted: { plugin: { updateSheetOpen: true } }
  })
  await view.settled()
  await view.activateRow({ type: 'Table' }, 'APP-1')
  assert.equal(view.find({ label: 'Summary' }), null)
  // A status picked in the sheet waits while the text is saved.
  await view.select({ label: 'Status' }, '2')
  await view.press({ label: 'Edit summary and description' })
  assert.equal(view.valueOf({ label: 'Summary' }), 'Fix login')
  assert.equal(view.valueOf({ label: 'Description' }), 'It breaks')
  await view.type({ label: 'Summary' }, 'Fix login on Safari', { replace: true })
  await view.type({ label: 'Description' }, ' on Safari 18')
  await view.press({ label: 'Save summary and description' })
  assert.deepEqual(updates, [{ key: 'APP-1', changes: { summary: 'Fix login on Safari', description: 'It breaks on Safari 18' } }])
  assert.equal(view.find({ label: 'Summary' }), null)
  assert.ok(view.find({ text: 'Fix login on Safari' }))
  assert.equal(view.valueOf({ label: 'Status' }), '2')
  assert.ok(view.find({ text: '1 pending' }))
  // Cancel puts the text back as Backlog has it.
  await view.press({ label: 'Edit summary and description' })
  await view.type({ label: 'Summary' }, 'Something else', { replace: true })
  await view.press({ label: 'Cancel editing' })
  await view.press({ label: 'Edit summary and description' })
  assert.equal(view.valueOf({ label: 'Summary' }), 'Fix login on Safari')
  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.refusals, [])
})

test('a link offers copy, the browser and Orca\'s browser', async () => {
  view = await mount(panel, { host: host(true) })
  await view.settled()
  await view.activateRow({ type: 'Table' }, 'APP-1')
  assert.equal(view.find({ role: 'button', text: 'Copy link' }), null)
  await view.press({ text: /^status\.example\.com\/incidents\/42/ })
  await view.press({ role: 'button', text: 'Copy link' })
  // The result shows inline under the links, not in a box at the top.
  assert.ok(view.find({ type: 'Text', text: 'Copied: https://status.example.com/incidents/42' }))
  assert.equal(view.find({ type: 'Callout' }), null)
  await view.press({ role: 'button', text: 'Open in Orca' })
  assert.deepEqual(linkCalls, [
    ['copy', { url: 'https://status.example.com/incidents/42' }],
    ['orca', { url: 'https://status.example.com/incidents/42' }]
  ])
  // A pull request's row picks its link too; a second press hides the actions.
  await view.press({ text: /^#7 Fix login/ })
  assert.equal(view.findAll({ role: 'button', text: 'Copy link' }).length, 1)
  await view.press({ text: /^#7 Fix login/ })
  assert.equal(view.find({ role: 'button', text: 'Copy link' }), null)
  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.refusals, [])
})

test('Columns picks which fields a table shows, per table, and remembers it', async () => {
  view = await mount(panel, { host: host(true) })
  await view.settled()
  const wide = { width: 900 }
  assert.deepEqual(view.columnsOf({ label: 'My issues' }, wide), ['key', 'summary', 'status', 'priority', 'due'])
  await view.press({ role: 'button', text: 'Columns (5)' })
  await view.toggle({ label: 'Assignee' })
  await view.toggle({ label: 'Priority' })
  await view.toggle({ label: 'Estimated' })
  assert.equal(view.find({ label: 'Key', type: 'Checkbox' })?.props.disabled, true)
  // Backlog's order, whatever the order they were picked in.
  assert.deepEqual(view.columnsOf({ label: 'My issues' }, wide), ['key', 'summary', 'assignee', 'status', 'due', 'estimatedHours'])
  assert.deepEqual(view.persisted.plugin.shownColumns, { home: ['key', 'summary', 'assignee', 'status', 'due', 'estimatedHours'] })
  await view.press({ role: 'button', text: 'Reset columns' })
  assert.deepEqual(view.columnsOf({ label: 'My issues' }, wide), ['key', 'summary', 'status', 'priority', 'due'])
  await view.press({ role: 'button', text: 'Done' })
  assert.equal(view.find({ label: 'Assignee', type: 'Checkbox' }), null)
  assert.deepEqual(view.errors, [])
})

test('settings shows the audit log and clears it after a second press', async () => {
  view = await mount(panel, { host: host(true, { 'settings.get': () => ({ accounts, projects: [] }) }) })
  await view.settled()
  await view.press({ label: 'Settings' })
  assert.deepEqual(view.rowsOf({ label: 'Audit log' }), ['a1'])
  assert.match(JSON.stringify(view.tree()), /PATCH \/api\/v2\/issues\/APP-1/)
  await view.press({ role: 'button', text: 'Clear' })
  assert.deepEqual(view.rowsOf({ label: 'Audit log' }), ['a1'])
  await view.press({ role: 'button', text: 'Press again to clear' })
  assert.deepEqual(view.rowsOf({ label: 'Audit log' }), ['c'])
  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.refusals, [])
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

test('connection settings trust a CA file and test the space', async () => {
  let saved: unknown
  const status = (s: { system: boolean; caFile: string }) => ({ ...s, node: 140, systemCount: 60, fileCount: s.caFile ? 1 : 0 })
  view = await mount(panel, {
    host: host(true, {
      'settings.get': () => ({ accounts, projects: [] }),
      'connection.get': () => status({ system: true, caFile: '' }),
      'connection.set': (input) => ((saved = input), status(input as { system: boolean; caFile: string })),
      'connection.test': () => ({ ok: false, message: 'Cannot reach acme.backlog.com: SELF_SIGNED_CERT_IN_CHAIN' })
    })
  })
  await view.settled()
  await view.press({ label: 'Settings' })
  const shown = () => JSON.stringify(view?.tree())
  assert.match(shown(), /200 certificates/)
  await view.type({ label: 'Extra CA certificate file (PEM)' }, 'C:\certs\root.pem')
  await view.press({ role: 'button', text: 'Apply' })
  assert.deepEqual(saved, { system: true, caFile: 'C:\certs\root.pem' })
  assert.match(shown(), /201 certificates/)
  await view.press({ role: 'button', text: 'Test connection' })
  assert.ok(view.find({ text: /SELF_SIGNED_CERT_IN_CHAIN/ }))
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
