// The web panel's logic (src/web/app.ts) in Node, against a fake host: no DOM, no Backlog.
import { assert, test } from 'orca/testing'
import { App, changesOf, textOn, columnsOf, COLUMNS, issueFilterOf, DEFAULT_FILTERS, STORAGE_KEY, type Host } from './app.js'
import type { IssueDetail, IssueRow } from '../protocol.js'

const row = (key: string): IssueRow => ({
  key,
  summary: `Summary ${key}`,
  status: 'Open',
  statusId: 1,
  priority: 'Normal',
  type: 'Task',
  typeColor: '#a1af2f',
  due: null,
  updated: 0,
  assignee: null,
  createdUser: null,
  updatedUser: null,
  created: 0,
  startDate: null,
  category: '',
  milestone: '',
  version: '',
  resolution: '',
  estimatedHours: null,
  actualHours: null
})

const fields = {
  summary: 'Fix login',
  description: 'It breaks',
  statusId: '1',
  resolutionId: '',
  assigneeId: '',
  priorityId: '3',
  issueTypeId: '1',
  categoryIds: [],
  milestoneIds: [],
  versionIds: [],
  startDate: '',
  dueDate: '',
  estimatedHours: '',
  actualHours: ''
}
const detail = { ...row('APP-1'), fields, projectId: 10, pullRequests: [], links: [], attachments: [], comments: [] } as unknown as IssueDetail

const session = { session: { accountId: 'a', space: 'acme.backlog.com', me: { id: 7, name: 'Me', userId: 'me' } }, accounts: [{ id: 'a', space: 'acme.backlog.com', name: 'Me' }], orcaProject: null }

/** A host whose requests answer from `handlers` and are recorded. */
function fakeHost(handlers: Record<string, (input: any) => unknown> = {}, stored: Record<string, unknown> = {}) {
  const calls: [string, any][] = []
  const host: Host = {
    request: async (name, input) => {
      calls.push([name, input])
      const handler = handlers[name]
      if (!handler) return name === 'issues.list' ? { issues: [], total: 0 } : name === 'issues.count' ? { count: 0 } : name === 'pullRequests.mine' || name === 'runs.get' ? [] : {}
      return handler(input)
    },
    openExternal: async () => ({ opened: true }),
    storageGet: async (key) => stored[key] ?? null,
    storageSet: async (key, value) => void (stored[key] = value)
  }
  return { host, calls, stored, of: (name: string) => calls.filter(([n]) => n === name).map(([, input]) => input) }
}
const settle = () => new Promise((r) => setTimeout(r, 5))

test('starts where the person left off, then signs in', async () => {
  const fake = fakeHost({ 'auth.status': () => session }, { [STORAGE_KEY]: { screen: 'issues', filters: { projectId: '10' }, junk: 1 } })
  const app = new App(fake.host)
  await app.start()
  await settle()
  assert.equal(app.state.screen, 'issues')
  // A partial saved filter fills in from the defaults; unknown keys are not taken.
  assert.equal(app.state.filters.projectId, '10')
  assert.equal(app.state.filters.status, DEFAULT_FILTERS.status)
  assert.equal((app.state as unknown as Record<string, unknown>).junk, undefined)
  assert.equal(app.state.session?.space, 'acme.backlog.com')
  assert.deepEqual(fake.of('issues.list')[0], { ...issueFilterOf(app.state.filters), sort: 'updated', order: 'desc', offset: 0 })
})

test('a list pages on, sorts by Backlog keys and drops answers that came too late', async () => {
  let slow: ((v: unknown) => void) | null = null
  const fake = fakeHost({
    'issues.list': (q) =>
      q.offset ? { issues: [row('APP-3')], total: 3 } : q.sort === 'dueDate' ? new Promise((r) => (slow = r)) : { issues: [row('APP-1'), row('APP-2')], total: 3 }
  })
  const app = new App(fake.host)
  await app.loadIssues()
  await app.loadIssues(true)
  assert.deepEqual(app.state.issueList.rows.map((r) => r.key), ['APP-1', 'APP-2', 'APP-3'])
  assert.equal(fake.of('issues.list')[1].offset, 2)
  // A sort the person changed again before it answered never overwrites the newer list.
  app.setFilter({ sort: { column: 'due', direction: 'asc' } })
  app.setFilter({ sort: { column: 'key', direction: 'asc' } })
  await settle()
  slow!({ issues: [row('OLD-1')], total: 1 })
  await settle()
  assert.deepEqual(app.state.issueList.rows.map((r) => r.key), ['APP-1', 'APP-2'])
  assert.equal(fake.of('issues.list').at(-1).sort, 'created')
})

test('another project resets the filters that belong to one project', async () => {
  const fake = fakeHost()
  const app = new App(fake.host)
  app.setFilter({ projectId: '10', categoryId: '30', status: '2', createdUserId: '7' })
  app.setFilter({ projectId: '11' })
  assert.equal(app.state.filters.categoryId, 'all')
  assert.equal(app.state.filters.status, 'notClosed')
  // Not tied to a project: kept.
  assert.equal(app.state.filters.createdUserId, '7')
  assert.equal(fake.of('meta.get').length, 2)
})

test('columns: Key always shows; widths are dragged, kept per table and reset', () => {
  const app = new App(fakeHost().host)
  const defaults = ['key', 'summary', 'status']
  app.toggleColumn('issues', defaults, 'key', false)
  app.toggleColumn('issues', defaults, 'due', true)
  assert.deepEqual(columnsOf(app.state, 'issues', defaults), ['key', 'summary', 'status', 'due'])
  app.setWidth('issues', 'summary', 12)
  assert.equal(app.state.widths.issues!.summary, 48, 'never narrower than a readable column')
  app.setWidth('issues', 'summary', 333.6)
  assert.equal(app.state.widths.issues!.summary, 334)
  assert.equal(app.state.widths.home, undefined)
  app.resetColumns('issues')
  assert.deepEqual(columnsOf(app.state, 'issues', defaults), defaults)
  assert.equal(app.state.widths.issues, undefined)
  assert.equal(COLUMNS.summary!.sortable, true)
})

test('saving sends only what changed, with the comment and files; the header part keeps its own edits', async () => {
  const fake = fakeHost({
    'issue.get': () => detail,
    'issue.update': (input) => ({ ...detail, fields: { ...fields, ...input.changes } }),
    'files.put': (input) => ({ id: 'f1', name: input.name, size: 3, kind: 'image' })
  })
  const app = new App(fake.host)
  await app.openIssue('APP-1')
  app.editFields({ statusId: '2', summary: 'Fix the login' })
  app.editComment('On it')
  await app.putFiles(detail, [{ name: 'paste.png', data: 'AAAA' }])
  assert.deepEqual(changesOf(detail.fields, app.state.editing!, 'fields'), { statusId: '2', comment: 'On it', files: ['f1'] })
  await app.saveIssue(detail, 'fields')
  assert.deepEqual(fake.of('issue.update')[0], { key: 'APP-1', changes: { statusId: '2', comment: 'On it', files: ['f1'] } })
  // The summary was edited in the header, not saved with the fields: it stays as typed.
  assert.equal(app.state.editing!.fields.summary, 'Fix the login')
  assert.equal(app.state.editing!.comment, '')
  assert.deepEqual(app.state.editing!.files, [])
  assert.match(app.state.notice!.text, /Saved 1 field, comment added, 1 file attached/)
})

test('Backlog AI: a question joins the chat; a failure puts it back in the box', async () => {
  let fail = false
  const fake = fakeHost({
    'ai.ask': (input) => (fail ? Promise.reject(new Error('Log in first')) : { threadId: 't1', text: `Re: ${input.question}`, tools: [], approval: null }),
    'ai.history': () => ({ threads: [{ id: 't1', title: 'Login bugs', updated: 1 }], usage: null })
  })
  const app = new App(fake.host)
  app.set({ aiDraft: 'Which bugs?' })
  await app.askAi()
  assert.equal(app.state.aiChat.threadId, 't1')
  assert.deepEqual(app.state.aiChat.turns.map((t) => t.answer.text), ['Re: Which bugs?'])
  fail = true
  app.set({ aiDraft: 'Again' })
  await app.askAi()
  assert.equal(app.state.aiDraft, 'Again')
  assert.equal(app.state.notice?.text, 'Log in first')
  assert.deepEqual(fake.of('ai.ask')[1], { question: 'Again', threadId: 't1' })
  // Summarize on an issue starts a new chat with its question.
  fail = false
  app.askAiAbout('Summarize APP-1')
  await settle()
  assert.equal(app.state.screen, 'ai')
  assert.deepEqual(fake.of('ai.ask').at(-1), { question: 'Summarize APP-1', threadId: null })
})

test('an inline image is fetched once, and again after a failure', async () => {
  let n = 0
  const fake = fakeHost({ 'attachment.data': () => (++n === 1 ? Promise.reject(new Error('timeout')) : { mime: 'image/png', data: 'AAAA' }) })
  const app = new App(fake.host)
  await assert.rejects(app.imageUrl('APP-1', 5), /timeout/)
  await settle()
  assert.equal(await app.imageUrl('APP-1', 5), 'data:image/png;base64,AAAA')
  assert.equal(await app.imageUrl('APP-1', 5), 'data:image/png;base64,AAAA')
  assert.equal(fake.of('attachment.data').length, 2)
})

test('where the person was is saved for the next start', async () => {
  const fake = fakeHost()
  const app = new App(fake.host)
  app.set({ screen: 'settings', detailTab: 'links' })
  await new Promise((r) => setTimeout(r, 350))
  const saved = fake.stored[STORAGE_KEY] as Record<string, unknown>
  assert.equal(saved.screen, 'settings')
  assert.equal(saved.detailTab, 'links')
  // Loaded data is not saved.
  assert.equal(saved.issueList, undefined)
})

test('labels in Backlog colours keep readable text: dark on light colours, white on dark ones', () => {
  // Yellow, light green, light blue, orange: dark text.
  for (const light of ['#f8d34f', '#a8d66f', '#8fd3f0', '#f5a623']) assert.equal(textOn(light), '#1f2328', light)
  // Dark red, grey, Backlog's blue: white text.
  for (const dark of ['#a1253f', '#666665', '#4488c5']) assert.equal(textOn(dark), '#fff', dark)
  assert.equal(textOn(null), '#fff')
  assert.equal(textOn('not a colour'), '#fff')
})

/** Dialogs that answer as told and record what they were asked. */
function answering(confirms: boolean[], pick?: { id: number | null; name: string }) {
  const asked: string[] = []
  return {
    asked,
    dialogs: {
      confirm: async (o: { title: string }) => (asked.push(o.title), confirms.shift() ?? false),
      pickMember: async (o: { title: string }) => (asked.push(o.title), pick)
    }
  }
}

test('assigning an issue offers its open pull requests too; No leaves them', async () => {
  const pr = { key: '5-1', number: 1, summary: 'Fix', repo: 'web', branch: 'b', base: 'main', status: 'Open', statusId: 1, author: null, updated: 0, url: '', projectId: 10, assigneeId: 2 }
  const merged = { ...pr, key: '5-2', number: 2, statusId: 3 }
  const fake = fakeHost({ 'issue.update': () => ({ ...detail, pullRequests: [pr, merged] }) })
  let ask = answering([true], { id: 3, name: 'Mina' })
  const app = new App(fake.host, ask.dialogs)
  await app.assignIssue({ key: 'APP-1', projectId: 10, assigneeId: 1 })
  assert.deepEqual(fake.of('issue.update')[0], { key: 'APP-1', changes: { assigneeId: '3' } })
  // Only the open one is offered.
  assert.deepEqual(ask.asked, ['Assign APP-1 to', 'Assign its pull request too?'])
  assert.deepEqual(fake.of('pullRequest.assign'), [{ key: '5-1', assigneeId: 3 }])
  // No: the pull request keeps its assignee.
  ask = answering([false], { id: 3, name: 'Mina' })
  app.dialogs = ask.dialogs
  await app.assignIssue({ key: 'APP-1', projectId: 10, assigneeId: 1 })
  assert.equal(fake.of('pullRequest.assign').length, 1)
  // Cancelled picker: nothing is sent.
  app.dialogs = answering([]).dialogs
  await app.assignIssue({ key: 'APP-1', projectId: 10, assigneeId: 1 })
  assert.equal(fake.of('issue.update').length, 2)
})

test('assigning a pull request offers the issue it links; Unassigned clears both', async () => {
  const fake = fakeHost({ 'issue.update': () => detail })
  const pr = { key: '5-1', number: 1, summary: 'Fix', repo: 'web', branch: 'b', base: 'main', status: 'Open', statusId: 1, author: null, updated: 0, url: '', projectId: 10, issueKey: 'APP-1' }
  const ask = answering([true], { id: null, name: 'Unassigned' })
  const app = new App(fake.host, ask.dialogs)
  await app.assignPullRequest(pr)
  assert.deepEqual(fake.of('pullRequest.assign'), [{ key: '5-1', assigneeId: null }])
  assert.deepEqual(ask.asked, ['Assign #1 to', 'Assign APP-1 too?'])
  assert.deepEqual(fake.of('issue.update'), [{ key: 'APP-1', changes: { assigneeId: '' } }])
})

test('every delete asks first, and No keeps things as they are', async () => {
  const fake = fakeHost({ 'account.remove': () => session, 'audit.clear': () => [], 'runs.unlink': () => [] })
  const ask = answering([false, false, false, true])
  const app = new App(fake.host, ask.dialogs)
  app.set({ accounts: session.accounts, editing: { key: 'APP-1', fields, comment: '', files: [{ id: 'f1', name: 'a.png', size: 1, kind: 'image' }] } })
  await app.removeAccount('a')
  await app.clearAudit()
  await app.linkRun('APP-1', 'w1', 'unlink')
  assert.equal(fake.of('account.remove').length + fake.of('audit.clear').length + fake.of('runs.unlink').length, 0)
  // Yes removes.
  await app.removeFile(detail, 'f1')
  assert.deepEqual(app.state.editing!.files, [])
  assert.deepEqual(fake.of('files.drop'), [{ ids: ['f1'] }])
  assert.deepEqual(ask.asked, ['Remove this account?', 'Clear the audit log?', 'Unlink this worktree from APP-1?', 'Remove this file from the comment?'])
})
