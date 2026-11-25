// Backlog for Orca, drawn with Orca's own components. No build step.
// Screens: Home (projects + my issues, like Backlog's dashboard) → a project's issues → an issue.
import {
  atom,
  Badge,
  Button,
  Callout,
  Card,
  Checkbox,
  Collapsible,
  Box,
  Heading,
  IconButton,
  Input,
  KeyValue,
  List,
  ListItem,
  Markdown,
  on,
  plugin,
  read,
  RelativeTime,
  Row,
  Select,
  Separator,
  set,
  shell,
  Spinner,
  Stack,
  Table,
  Text,
  Textarea,
  type Atom,
  type OrcaNode,
  type PanelContext,
  type TableColumn,
  type TableSort,
  type Tone
} from 'orca'
import type {
  Account,
  AccountSettings,
  AuditEntry,
  FoundCredential,
  AuthState,
  CertificateStatus,
  DueFilter,
  IssueChanges,
  IssueDetail,
  IssueFields,
  IssueFilter,
  IssueRow,
  IssueRun,
  LaunchOptions,
  Meta,
  Option,
  Session,
  SortKey,
  Subtasking
} from './protocol'
import { ATTACHMENT_SCHEME } from './protocol'

// --- State ---------------------------------------------------------------------------------------

/** undefined while the worker looks for a login. */
const session = atom<Session | null | undefined>(undefined)
const authError = atom<string | null>(null)
const form = atom({ space: '', apiKey: '' })

const accountsState = atom<{ accounts: Account[]; orcaProject: Option | null }>({ accounts: [], orcaProject: null })
const settings = atom<AccountSettings | null>(null)
const connection = atom<CertificateStatus | null>(null)
/** Settings → Audit log; null while it loads. */
const auditEntries = atom<AuditEntry[] | null>(null)
/** Clear asks once more before it empties the log. */
const confirmClear = atom(false)
/** backlog-mcp-server entries found in configs on this machine; null while scanning. */
const found = atom<FoundCredential[] | null>(null)
/** The CA file path while it is typed; saved on Enter or Apply. */
const caFileDraft = atom<string | null>(null)
const connectionTest = atom<{ tone: Tone; text: string } | null>(null)

/** Persisted, like openKey and trail: navigation survives reloads and restarts. */
const screen = atom<'home' | 'issues' | 'settings'>('screen', 'home', { persist: 'plugin' })
const meta = atom<Meta | null>(null)

type ListState = { rows: IssueRow[]; total: number; loading: boolean; error: string | null }
const emptyList: ListState = { rows: [], total: 0, loading: false, error: null }

/** Home: Backlog's "My Issues" box. */
type Who = 'assigned' | 'created'
type Dashboard = { who: Who; due: DueFilter; sort: TableSort }
const dashboard = atom<Dashboard>(
  'dashboard',
  { who: 'assigned', due: 'all', sort: { column: 'due', direction: 'asc' } },
  { persist: 'plugin' }
)
const dashList = atom<ListState>(emptyList)
const dashCounts = atom<Record<string, number>>({})

/** A project's issue list. */
/** Backlog's Advanced Search: each an id or `all`. */
const ADVANCED = {
  issueTypeId: 'all',
  categoryId: 'all',
  versionId: 'all',
  milestoneId: 'all',
  createdUserId: 'all',
  resolutionId: 'all',
  parentChild: '0' as Subtasking,
  attachment: false,
  sharedFile: false
}
/** Advanced fields that belong to one project, reset when the project changes. */
const PER_PROJECT = { issueTypeId: 'all', categoryId: 'all', versionId: 'all', milestoneId: 'all' }

type Filters = typeof ADVANCED & {
  projectId: string
  assignee: string
  status: string
  priorityId: string
  keyword: string
  sort: TableSort
}
const DEFAULT_FILTERS: Filters = {
  projectId: 'all',
  assignee: 'me',
  status: 'notClosed',
  priorityId: 'all',
  keyword: '',
  sort: { column: 'updated', direction: 'desc' },
  ...ADVANCED
}
const filters = atom<Filters>('issueFilters', DEFAULT_FILTERS, {
  persist: 'plugin',
  version: 2,
  // Version 1 had no advanced fields.
  migrate: (stored) => ({ ...DEFAULT_FILTERS, ...(stored as Partial<Filters>) })
})
const advancedOpen = atom('advancedOpen', false, { persist: 'plugin' })
const issueList = atom<ListState>(emptyList)

const openKey = atom<string | null>('openKey', null, { persist: 'plugin' })
/** Issues opened before this one through their links; Back walks it. */
const trail = atom<string[]>('trail', [], { persist: 'plugin' })
const detail = atom<{ issue: IssueDetail | null; error: string | null }>({ issue: null, error: null })
const notice = atom<{ tone: Tone; text: string } | null>(null)

const launchOptions = atom<LaunchOptions | null>(null)
/** The last choices survive restarts, so the next issue starts the same way. */
const choice = atom('launchChoice', { target: '', agent: '', skill: '' }, { persist: 'plugin' })
const launching = atom(false)
/** Which collapsible sections are closed; kept across screens and restarts. */
const closedSections = atom<string[]>('closedSections', [], { persist: 'plugin' })
const NO_SKILL = 'none'
/** The open issue's edit form: fields as typed and a comment. */
const editing = atom<{ key: string; fields: IssueFields; comment: string } | null>(null)
/** Statuses, members, types… of the open issue's project, for the edit form. */
const editMeta = atom<{ projectId: number; meta: Meta } | null>(null)
const saving = atom(false)
const saveError = atom<string | null>(null)
/** Workspaces agents were started in for the open issue. */
const issueRuns = atom<{ key: string; runs: IssueRun[] } | null>(null)
/** The first message for the agent, for one issue, agent and skill; `edited` keeps it on changes. */
const promptDraft = atom<{ basis: string; text: string; edited: boolean } | null>(null)

// --- Helpers -------------------------------------------------------------------------------------

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const patch = <T extends object>(a: Atom<T>, part: Partial<T>) => set(a, { ...read(a), ...part })
/** Orca refuses to draw a Select with more than 500 options. */
const MAX_SELECT_OPTIONS = 500
/** `fixed` first, then as many of `rest` as a Select can hold. */
const fitOptions = (fixed: readonly Option[], rest: readonly Option[]): Option[] => [
  ...fixed,
  ...rest.slice(0, MAX_SELECT_OPTIONS - fixed.length).map(({ value, label }) => ({ value, label }))
]
const withAll = (label: string, options: readonly Option[]): Option[] => fitOptions([{ value: 'all', label }], options)

/** `{ [name]: value }`, or nothing for "all": the bridge refuses fields set to undefined. */
const picked = <K extends string>(name: K, value: string) =>
  (value === 'all' ? {} : { [name]: value }) as Partial<Record<K, string>>

/** Table column → Backlog `sort`. Keys sort as creation order, which is how Backlog numbers them. */
const SORT_BY: Record<string, SortKey> = {
  key: 'created',
  summary: 'summary',
  status: 'status',
  priority: 'priority',
  due: 'dueDate',
  updated: 'updated'
}

/** Every column either table can show; each screen picks its own. */
const COLUMNS: Record<string, TableColumn> = {
  key: { key: 'key', label: 'Key', width: 'sm', sortable: true },
  summary: { key: 'summary', label: 'Summary', minWidth: 'md', sortable: true },
  status: { key: 'status', label: 'Status', width: 'sm', sortable: true, hideBelow: 'sm' },
  priority: { key: 'priority', label: 'Priority', width: 'xs', sortable: true, hideBelow: 'md' },
  due: { key: 'due', label: 'Due', width: 'sm', sortable: true, hideBelow: 'md' },
  updated: { key: 'updated', label: 'Updated', width: 'sm', sortable: true, hideBelow: 'sm' }
}

const STATUS_TONE: Record<number, Tone> = { 1: 'danger', 2: 'accent', 3: 'success', 4: 'neutral' }
const statusTone = (id: number): Tone => STATUS_TONE[id] ?? 'warning'

/** Backlog's issue type colour, as the nearest of the tones Orca can draw. */
export function toneOfColor(hex: string | null): Tone {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '')
  if (!m) return 'neutral'
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x!, 16) / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max - min < 0.15) return 'neutral' // grey
  const d = max - min
  const hue = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60
  const h = (hue + 360) % 360
  if (h < 12 || h >= 300) return 'danger'
  if (h < 60) return 'warning'
  if (h < 170) return 'success'
  return 'neutral'
}

const ATTACHMENT_ICON = { image: 'file', video: 'play', file: 'download' } as const
const ATTACHMENT_ACTION = { image: 'Preview in Orca', video: 'Preview in Orca', file: 'Download and open folder' } as const

const DUE_TABS: { value: DueFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: '4days', label: '4 Days' },
  { value: 'today', label: 'Due Today' },
  { value: 'overdue', label: 'Overdue' }
]

function size(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let u = 0
  while (n >= 1024 && u < units.length - 1) (n /= 1024), u++
  return `${n.toFixed(u ? 1 : 0)} ${units[u]}`
}

// --- Loading -------------------------------------------------------------------------------------

/** Only the newest request per table may write its answer. */
const seqs = new Map<Atom<ListState>, number>()
async function loadInto(target: Atom<ListState>, filter: IssueFilter, sort: TableSort, append: boolean): Promise<void> {
  const seq = (seqs.get(target) ?? 0) + 1
  seqs.set(target, seq)
  const previous = append ? read(target).rows : []
  patch(target, { loading: true, error: null, ...(append ? {} : { rows: [] }) })
  try {
    const page = await plugin.request('issues.list', {
      ...filter,
      sort: SORT_BY[sort.column] ?? 'updated',
      order: sort.direction,
      offset: previous.length
    })
    if (seqs.get(target) === seq) set(target, { rows: [...previous, ...page.issues], total: page.total, loading: false, error: null })
  } catch (error) {
    if (seqs.get(target) === seq) patch(target, { loading: false, error: message(error) })
  }
}

/** Not-closed issues assigned to me or created by me, as Backlog's dashboard counts them. */
const dashFilter = (who: Who, due: DueFilter): IssueFilter => ({
  status: 'notClosed',
  assignee: who === 'assigned' ? 'me' : 'all',
  createdByMe: who === 'created',
  due
})

function loadDashboard(append = false): void {
  const d = read(dashboard)
  void loadInto(dashList, dashFilter(d.who, d.due), d.sort, append)
  if (append) return
  const counts: [string, IssueFilter][] = [
    ['assigned', dashFilter('assigned', 'all')],
    ['created', dashFilter('created', 'all')],
    ...DUE_TABS.map((t): [string, IssueFilter] => [t.value, dashFilter(d.who, t.value)])
  ]
  for (const [name, filter] of counts) {
    void plugin
      .request('issues.count', filter)
      .then(({ count }) => patch(dashCounts, { [name]: count }))
      .catch(() => undefined)
  }
}

function issueFilter(): IssueFilter {
  const f = read(filters)
  return {
    ...picked('projectId', f.projectId),
    ...picked('priorityId', f.priorityId),
    ...picked('issueTypeId', f.issueTypeId),
    ...picked('categoryId', f.categoryId),
    ...picked('versionId', f.versionId),
    ...picked('milestoneId', f.milestoneId),
    ...picked('createdUserId', f.createdUserId),
    ...picked('resolutionId', f.resolutionId),
    ...(f.parentChild !== '0' ? { parentChild: f.parentChild } : {}),
    ...(f.attachment ? { attachment: true } : {}),
    ...(f.sharedFile ? { sharedFile: true } : {}),
    assignee: f.assignee,
    status: f.status,
    keyword: f.keyword
  }
}

/** How many advanced filters narrow the list now. */
function advancedCount(f: Filters): number {
  return (Object.keys(ADVANCED) as (keyof typeof ADVANCED)[]).filter((k) => f[k] !== ADVANCED[k]).length
}

const loadIssues = (append = false) => loadInto(issueList, issueFilter(), read(filters).sort, append)

async function loadMeta(): Promise<void> {
  try {
    set(meta, await plugin.request('meta.get', picked('projectId', read(filters).projectId)))
  } catch (error) {
    patch(issueList, { error: message(error) })
  }
}

// --- Navigation and filters ----------------------------------------------------------------------

function setDashboard(part: Partial<Dashboard>): void {
  // The due tab counts belong to one "who": recount when it changes.
  const recount = part.who !== undefined && part.who !== read(dashboard).who
  patch(dashboard, part)
  if (recount) loadDashboard()
  else void loadInto(dashList, dashFilter(read(dashboard).who, read(dashboard).due), read(dashboard).sort, false)
}

function setFilter(part: Partial<Filters>): void {
  const projectChanged = part.projectId !== undefined && part.projectId !== read(filters).projectId
  // A project's statuses, types, categories and versions have their own ids: reset them.
  patch(filters, projectChanged ? { status: 'notClosed', ...PER_PROJECT, ...part } : part)
  if (projectChanged) void loadMeta()
  void loadIssues()
}

function openProject(projectId: string): void {
  set(screen, 'issues')
  setFilter({ projectId, keyword: '' })
}

function goHome(): void {
  set(screen, 'home')
  loadDashboard()
}

function refresh(): void {
  const now = read(screen)
  if (now === 'home') loadDashboard()
  else if (now === 'issues') void loadIssues()
  else void loadSettings()
}

let keywordTimer: ReturnType<typeof setTimeout> | undefined
function typeKeyword(keyword: string): void {
  patch(filters, { keyword })
  clearTimeout(keywordTimer)
  keywordTimer = setTimeout(() => void loadIssues(), 350)
}

// --- Session -------------------------------------------------------------------------------------

/** Shows what the worker answered; another account starts from Home with its own data. */
function applyAuth(next: AuthState): void {
  const before = read(session)?.accountId
  set(session, next.session)
  set(accountsState, { accounts: next.accounts, orcaProject: next.orcaProject })
  set(authError, next.error ?? null)
  if (!next.session) void loadFound()
  if (!next.session || next.session.accountId === before) return
  if (before) {
    // Project, status and user ids belong to the old space.
    set(openKey, null)
    patch(filters, { projectId: 'all', assignee: 'me', status: 'notClosed', priorityId: 'all' })
    if (read(screen) === 'issues') set(screen, 'home')
  }
  void loadMeta()
  refresh()
  // After a reload the open issue is still named but its loaded detail is gone.
  const key = read(openKey)
  if (key && read(detail).issue?.key !== key) void openIssue(key)
}

async function runAuth(task: () => Promise<AuthState>): Promise<boolean> {
  try {
    applyAuth(await task())
    return true
  } catch (error) {
    set(authError, message(error))
    return false
  }
}

async function login(): Promise<void> {
  if (await runAuth(() => plugin.request('auth.login', read(form)))) {
    set(form, { space: '', apiKey: '' })
    if (read(screen) === 'settings') void loadSettings()
  }
}

async function loadFound(): Promise<void> {
  set(found, null)
  try {
    set(found, await plugin.request('credentials.found'))
  } catch (error) {
    set(found, [])
    set(authError, message(error))
  }
}

async function useFound(id: string): Promise<void> {
  const ok = await runAuth(() => plugin.request('credentials.use', { id }))
  // Either way the list changes: the entry is now saved, or it carries the failure.
  void loadFound()
  if (ok && read(screen) === 'settings') void loadSettings()
}

/** Switching here also remembers the account for the Orca project in focus. */
const useAccount = (id: string) => runAuth(() => plugin.request('account.use', { id }))

async function removeAccount(id: string): Promise<void> {
  await runAuth(() => plugin.request('account.remove', { id }))
  void loadSettings()
}

async function loadAudit(): Promise<void> {
  set(confirmClear, false)
  try {
    set(auditEntries, await plugin.request('audit.list'))
  } catch (error) {
    set(auditEntries, [])
    set(authError, message(error))
  }
}

async function clearAudit(): Promise<void> {
  if (!read(confirmClear)) return set(confirmClear, true)
  set(confirmClear, false)
  set(auditEntries, await plugin.request('audit.clear'))
}

async function loadSettings(): Promise<void> {
  void loadConnection()
  void loadAudit()
  void loadFound()
  try {
    set(settings, await plugin.request('settings.get'))
  } catch (error) {
    set(authError, message(error))
  }
}

function openSettings(): void {
  set(openKey, null)
  set(screen, 'settings')
  void loadSettings()
}

async function loadConnection(): Promise<void> {
  try {
    set(connection, await plugin.request('connection.get'))
  } catch (error) {
    set(connectionTest, { tone: 'danger', text: message(error) })
  }
}

async function setConnection(part: { system?: boolean; caFile?: string }): Promise<void> {
  const now = read(connection)
  if (!now) return
  set(connectionTest, null)
  set(connection, await plugin.request('connection.set', { system: now.system, caFile: now.caFile, ...part }))
  set(caFileDraft, null)
}

async function testConnection(): Promise<void> {
  set(connectionTest, { tone: 'neutral', text: 'Testing…' })
  const { ok, message: text } = await plugin.request('connection.test')
  set(connectionTest, { tone: ok ? 'success' : 'danger', text })
}

async function mapProject(projectId: string, accountId: string): Promise<void> {
  set(settings, await plugin.request('settings.map', { projectId, accountId }))
}

// --- Issue detail --------------------------------------------------------------------------------

async function openIssue(key: string): Promise<void> {
  set(openKey, key)
  set(detail, { issue: null, error: null })
  set(notice, null)
  try {
    const issue = await plugin.request('issue.get', { key }, { timeoutMs: 120_000 })
    if (read(openKey) === key) {
      set(detail, { issue, error: null })
      startEditing(issue)
    }
  } catch (error) {
    if (read(openKey) === key) set(detail, { issue: null, error: message(error) })
  }
  void loadRuns(key)
  if (!read(launchOptions)) await loadLaunchOptions()
  if (read(openKey) === key) void refreshPrompt(key, true)
}

function startEditing(issue: IssueDetail): void {
  set(editing, { key: issue.key, fields: issue.fields, comment: '' })
  set(saveError, null)
  if (read(editMeta)?.projectId !== issue.projectId) void loadEditMeta(issue.projectId)
}

async function loadEditMeta(projectId: number): Promise<void> {
  set(editMeta, null)
  try {
    set(editMeta, { projectId, meta: await plugin.request('meta.get', { projectId: String(projectId) }) })
  } catch (error) {
    set(saveError, `Cannot load the project's statuses and members: ${message(error)}`)
  }
}

const sameValue = (a: string | string[], b: string | string[]) => JSON.stringify(a) === JSON.stringify(b)

/** What the form changed, field by field, with the comment when there is one. */
export function changesOf(from: IssueFields, form: { fields: IssueFields; comment: string }): IssueChanges {
  const changes: Record<string, string | string[]> = {}
  for (const [name, value] of Object.entries(form.fields) as [keyof IssueFields, string | string[]][]) {
    if (!sameValue(value, from[name])) changes[name] = value
  }
  return { ...changes, ...(form.comment.trim() ? { comment: form.comment } : {}) }
}

async function saveIssue(issue: IssueDetail): Promise<void> {
  const form = read(editing)
  if (!form || form.key !== issue.key || read(saving)) return
  const changes = changesOf(issue.fields, form)
  if (!Object.keys(changes).length) return
  set(saving, true)
  set(saveError, null)
  try {
    const next = await plugin.request('issue.update', { key: issue.key, changes }, { timeoutMs: 120_000 })
    if (read(openKey) !== issue.key) return
    set(detail, { issue: next, error: null })
    startEditing(next)
    const fields = Object.keys(changes).filter((c) => c !== 'comment').length
    const parts = [fields ? `Saved ${fields} field${fields > 1 ? 's' : ''}` : null, changes.comment ? 'comment added' : null]
    set(notice, { tone: 'success', text: `${parts.filter(Boolean).join(', ')}.` })
    refresh()
  } catch (error) {
    set(saveError, message(error))
  } finally {
    set(saving, false)
  }
}

async function loadRuns(key: string): Promise<void> {
  try {
    const runs = await plugin.request('runs.get', { key })
    if (read(openKey) === key) set(issueRuns, { key, runs })
  } catch (error) {
    set(notice, { tone: 'danger', text: `Cannot list the issue's worktrees: ${message(error)}` })
  }
}

async function focusRun(workspaceId: string): Promise<void> {
  try {
    await plugin.request('runs.focus', { workspaceId })
  } catch (error) {
    set(notice, { tone: 'danger', text: message(error) })
  }
}

/** Fills the prompt for the current choice; a prompt the person edited stays unless `reset`. */
async function refreshPrompt(key: string, reset = false): Promise<void> {
  const { agent, skill } = read(choice)
  const basis = `${key}|${agent}|${skill}`
  const draft = read(promptDraft)
  if (!agent || (!reset && draft?.edited && draft.basis.startsWith(`${key}|`))) return
  set(promptDraft, { basis, text: '', edited: false })
  try {
    const { prompt } = await plugin.request('launch.prompt', { key, agent, ...(skill ? { skill } : {}) })
    if (read(promptDraft)?.basis === basis) set(promptDraft, { basis, text: prompt, edited: false })
  } catch (error) {
    set(notice, { tone: 'danger', text: `Cannot write the prompt: ${message(error)}` })
  }
}

function chooseLaunch(key: string, part: { agent?: string; skill?: string }): void {
  patch(choice, part)
  void refreshPrompt(key)
}

/** From a table: a fresh trail. */
function openFromList(key: string): void {
  set(trail, [])
  void openIssue(key)
}

/** From a linked issue: Back returns here. */
function followIssue(key: string): void {
  const from = read(openKey)
  if (from) set(trail, [...read(trail), from])
  void openIssue(key)
}

function backFromIssue(): void {
  const t = read(trail)
  const previous = t[t.length - 1]
  if (!previous) return set(openKey, null)
  set(trail, t.slice(0, -1))
  void openIssue(previous)
}

async function loadLaunchOptions(): Promise<void> {
  try {
    const options = await plugin.request('launch.options', undefined, { timeoutMs: 60_000 })
    set(launchOptions, options)
    const c = read(choice)
    const has = (list: readonly Option[], value: string) => list.some((o) => o.value === value)
    patch(choice, {
      target: has(options.targets, c.target) ? c.target : (options.focused ?? options.targets[0]?.value ?? ''),
      agent: has(options.agents, c.agent) ? c.agent : (options.defaultAgent ?? '')
    })
  } catch (error) {
    set(notice, { tone: 'danger', text: `Cannot list agents and skills: ${message(error)}` })
  }
}

async function openAttachment(key: string, attachmentId: number): Promise<void> {
  set(notice, { tone: 'neutral', text: 'Downloading…' })
  try {
    const result = await plugin.request('attachment.open', { key, attachmentId }, { timeoutMs: 120_000 })
    const how = { preview: 'Opened in Orca', folder: 'Saved and opened its folder', external: 'Opened with the system viewer' }
    set(notice, { tone: 'success', text: `${how[result.mode]}: ${result.path}` })
  } catch (error) {
    set(notice, { tone: 'danger', text: message(error) })
  }
}

async function startAgent(key: string): Promise<void> {
  const { target, agent, skill } = read(choice)
  const prompt = read(promptDraft)?.text.trim()
  set(launching, true)
  set(notice, null)
  try {
    await plugin.request(
      'launch.start',
      { key, target, agent, ...(skill ? { skill } : {}), ...(prompt ? { prompt } : {}) },
      { timeoutMs: 120_000 }
    )
    void loadRuns(key)
    const label = read(launchOptions)?.agents.find((a) => a.value === agent)?.label ?? agent
    set(notice, { tone: 'success', text: `${label} started on ${key}${skill ? ` with ${skill}` : ''}.` })
  } catch (error) {
    set(notice, { tone: 'danger', text: message(error) })
  } finally {
    set(launching, false)
  }
}

export function setup(ctx: PanelContext): void {
  ctx.subscriptions.push(
    plugin.on('auth.changed', applyAuth),
    // Another workspace may belong to an Orca project that uses another account.
    on('workspace.changed', () => void runAuth(() => plugin.request('auth.status')))
  )
  void runAuth(() => plugin.request('auth.status')).then((ok) => ok || set(session, null))
}

// --- Shared views --------------------------------------------------------------------------------

function ErrorCallout({ title, text }: { title: string; text: string | null }) {
  return text ? (
    <Callout tone="danger" title={title}>
      <Text size="sm">{text}</Text>
    </Callout>
  ) : null
}

function Notice() {
  const n = read(notice)
  return n ? (
    <Callout tone={n.tone}>
      <Text size="sm">{n.text}</Text>
    </Callout>
  ) : null
}

/** A Collapsible whose open state the panel keeps, so it survives screen changes. */
function Section({ title, id, children }: { title: string; id: string; children?: OrcaNode }) {
  const closed = read(closedSections).includes(id)
  return (
    <Collapsible
      title={title}
      open={!closed}
      onChange={(open) => set(closedSections, open ? read(closedSections).filter((s) => s !== id) : [...read(closedSections), id])}
    >
      {children}
    </Collapsible>
  )
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Button size="xs" variant="ghost" onPress={onPress}>
      ← Back
    </Button>
  )
}

/**
 * Controls that share one row when the panel is wide and wrap when it is narrow: each grows to
 * an equal share and never shrinks below a readable width.
 */
function FilterRow({ children }: { children?: OrcaNode }) {
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean)
  return (
    <Row gap="xs" wrap>
      {items.map((child, index) => (
        <Box key={String(index)} grow minWidth={160}>
          {child}
        </Box>
      ))}
    </Row>
  )
}

/** A Backlog-style segmented control: the active option is solid, each shows its count. */
function Segmented<T extends string>(props: {
  options: readonly { value: T; label: string }[]
  value: T
  counts: Record<string, number>
  onChange: (value: T) => void
}) {
  return (
    <Row gap="xs" wrap>
      {props.options.map((o) => (
        <Button
          key={o.value}
          size="sm"
          variant={o.value === props.value ? 'solid' : 'outline'}
          tone={o.value === props.value ? 'accent' : 'neutral'}
          onPress={() => props.onChange(o.value)}
        >
          {props.counts[o.value] === undefined ? o.label : `${o.label} ${props.counts[o.value]}`}
        </Button>
      ))}
    </Row>
  )
}

function IssueTable(props: {
  label: string
  state: ListState
  columns: readonly string[]
  sort: TableSort
  onSort: (sort: TableSort) => void
  onLoadMore: () => void
}) {
  const { state } = props
  return (
    <Stack gap="xs">
      <ErrorCallout title="Backlog" text={state.error} />
      <Table
        label={props.label}
        maxHeight="none"
        loading={state.loading}
        emptyText="No issues to display."
        selectionMode="single"
        sort={props.sort}
        hasMore={state.rows.length < state.total}
        onLoadMore={props.onLoadMore}
        onSortChange={props.onSort}
        onSelectionChange={({ keys }) => keys[0] && openFromList(keys[0])}
        onRowAction={({ key }) => openFromList(key)}
        columns={props.columns.map((c) => COLUMNS[c]!)}
        rows={state.rows.map((r) => ({
          key: r.key,
          cells: {
            key: r.key,
            summary: r.summary,
            status: r.status,
            priority: r.priority,
            due: r.due,
            updated: { type: 'relative', at: r.updated, format: 'short' }
          }
        }))}
      />
    </Stack>
  )
}

const accountOptions = (accounts: readonly Account[]): Option[] =>
  accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.space}` }))

/** The account in use; a change is remembered for the focused Orca project. */
function AccountPicker({ me }: { me: Session }) {
  const { accounts, orcaProject } = read(accountsState)
  return (
    <Stack gap="xs">
      <Select
        label="Account"
        labelHidden
        value={me.accountId}
        options={accountOptions(accounts)}
        onChange={(id) => void useAccount(id)}
      />
      {orcaProject ? (
        <Text muted size="xs" truncate>
          Used for Orca project {orcaProject.label}
        </Text>
      ) : null}
    </Stack>
  )
}

function Header({ title, back, me }: { title: string; back?: () => void; me: Session }) {
  return (
    <Stack gap="xs">
      <Row justify="between" align="center">
        <Row gap="xs" align="center">
          {back ? <BackButton onPress={back} /> : null}
          <Heading level={2}>{title}</Heading>
        </Row>
        <Row gap="xs">
          <IconButton icon="refresh" label="Refresh" size="sm" variant="ghost" onPress={refresh} />
          <IconButton icon="settings" label="Settings" size="sm" variant="ghost" onPress={openSettings} />
        </Row>
      </Row>
      <AccountPicker me={me} />
    </Stack>
  )
}

// --- Screens -------------------------------------------------------------------------------------

/** Credentials already on this machine, one press away from an account. */
function FoundCredentials() {
  const list = read(found)
  return (
    <Stack gap="xs">
      <Row justify="between" align="center">
        <Text weight="medium" size="sm">
          Found on this computer
        </Text>
        <IconButton icon="refresh" label="Scan again" variant="ghost" size="sm" disabled={!list} onPress={loadFound} />
      </Row>
      {!list ? (
        <Spinner label="Looking for backlog-mcp-server configs" />
      ) : list.length ? (
        <List label="Found credentials">
          {list.map((c) => (
            <ListItem
              key={c.id}
              icon={c.error ? 'warning' : 'link'}
              title={c.saved ? `${c.space} · saved` : c.space}
              description={`${c.file} · key ${c.keyHint}${c.error ? ` · ${c.error}` : ''}`}
              onPress={() => useFound(c.id)}
            />
          ))}
        </List>
      ) : (
        <Text muted size="xs">
          No BACKLOG_DOMAIN / BACKLOG_API_KEY in Claude, Cursor, Windsurf, Gemini, Codex or VS Code MCP
          configs, nor in this workspace's .mcp.json.
        </Text>
      )}
    </Stack>
  )
}

function AccountForm() {
  const f = read(form)
  return (
    <Stack gap="sm">
      <FoundCredentials />
      <Separator />
      <Input label="Space" placeholder="your-space.backlog.com" value={f.space} onChange={(space) => patch(form, { space })} />
      <Input
        label="API key"
        type="password"
        value={f.apiKey}
        onChange={(apiKey) => patch(form, { apiKey })}
        onSubmit={() => void login()}
      />
      <ErrorCallout title="Sign-in failed" text={read(authError)} />
      <Button tone="accent" icon="link" disabled={!f.space.trim() || !f.apiKey.trim()} onPress={login}>
        Connect
      </Button>
    </Stack>
  )
}

function LoginView() {
  return (
    <Card title="Connect to Backlog" description="Sign in with a personal API key (Backlog → Personal settings → API).">
      <Stack gap="sm">
        <AccountForm />
      </Stack>
    </Card>
  )
}

const LAST_USED = 'lastUsed'

function SettingsView() {
  const s = read(settings)
  const { accounts } = read(accountsState)
  const inUse = read(session)?.accountId
  return (
    <Stack gap="md">
      <Row gap="xs" align="center">
        <BackButton onPress={goHome} />
        <Heading level={2}>Settings</Heading>
      </Row>
      <Section title="Accounts" id="settings.accounts">
        <Stack gap="sm">
          {accounts.map((a) => (
            <Row key={a.id} justify="between" align="center">
              <Stack gap="none">
                <Text weight="medium">
                  {a.name} {a.id === inUse ? <Badge tone="accent">In use</Badge> : null}
                </Text>
                <Text muted size="xs">
                  {a.space}
                </Text>
              </Stack>
              <IconButton
                icon="delete"
                label={`Remove ${a.name} · ${a.space}`}
                tone="danger"
                variant="ghost"
                size="sm"
                onPress={() => removeAccount(a.id)}
              />
            </Row>
          ))}
        </Stack>
      </Section>
      <Section title="Add account" id="settings.add">
        <AccountForm />
      </Section>
      <Section title="Connection" id="settings.connection">
        <ConnectionSettings />
      </Section>
      <Section title="Audit log" id="settings.audit">
        <AuditLog />
      </Section>
      <Section title="Account per Orca project" id="settings.projects">
        <Stack gap="sm">
          <Text muted size="xs">
            Switching account in the header also remembers it for the Orca project in focus.
          </Text>
          {!s ? (
            <Spinner label="Loading projects" />
          ) : (
            s.projects.map((proj) => (
              <Select
                key={proj.value}
                label={proj.label}
                value={proj.accountId || LAST_USED}
                options={[{ value: LAST_USED, label: 'Last used account' }, ...accountOptions(accounts)]}
                onChange={(id) => void mapProject(proj.value, id === LAST_USED ? '' : id)}
              />
            ))
          )}
        </Stack>
      </Section>
    </Stack>
  )
}

const AUDIT_COLUMNS: TableColumn[] = [
  { key: 'at', label: 'When', width: 'sm' },
  { key: 'action', label: 'Action', minWidth: 'md' },
  { key: 'target', label: 'Target', width: 'sm', hideBelow: 'sm' },
  { key: 'api', label: 'API', minWidth: 'md', hideBelow: 'md' },
  { key: 'details', label: 'Details', minWidth: 'md', hideBelow: 'md' },
  { key: 'result', label: 'Result', width: 'sm' }
]

/** Every change the plugin made, to trace who changed what through which API. */
function AuditLog() {
  const entries = read(auditEntries)
  const failed = entries?.filter((e) => !e.ok).length ?? 0
  return (
    <Stack gap="sm">
      <Row justify="between" align="center" wrap>
        <Text muted size="xs">
          {entries ? `${entries.length} change${entries.length === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}; the newest 500 are kept on this computer.` : ' '}
        </Text>
        <Row gap="xs">
          <IconButton icon="refresh" label="Reload audit log" variant="ghost" size="sm" onPress={loadAudit} />
          <Button size="sm" variant="ghost" tone={read(confirmClear) ? 'danger' : 'neutral'} disabled={!entries?.length} onPress={clearAudit}>
            {read(confirmClear) ? 'Press again to clear' : 'Clear'}
          </Button>
        </Row>
      </Row>
      <Table
        label="Audit log"
        columns={AUDIT_COLUMNS}
        loading={!entries}
        emptyText="Nothing changed yet."
        maxHeight="md"
        rows={(entries ?? []).map((e) => ({
          key: e.id,
          cells: {
            at: { type: 'relative', at: e.at },
            action: e.space ? `${e.action} (${e.space})` : e.action,
            target: e.target ?? '',
            api: e.api,
            details: e.details ?? '',
            result: e.ok ? 'OK' : `Failed: ${e.error ?? ''}`
          }
        }))}
      />
    </Stack>
  )
}

/** Which CA certificates HTTPS trusts: for proxies and antivirus that re-sign it. */
function ConnectionSettings() {
  const c = read(connection)
  const test = read(connectionTest)
  if (!c) return <Spinner label="Loading connection settings" />
  const caFile = read(caFileDraft) ?? c.caFile
  const edited = caFile.trim() !== c.caFile
  const total = c.node + c.systemCount + c.fileCount
  return (
    <Stack gap="sm">
      <Text muted size="xs">
        Behind a company proxy or antivirus that inspects HTTPS, Backlog fails with
        SELF_SIGNED_CERT_IN_CHAIN until its root certificate is trusted here.
      </Text>
      <Checkbox
        label="Trust the system's certificates"
        description="The certificate store of Windows, macOS or Linux, where IT usually installs it."
        checked={c.system}
        onChange={(system) => void setConnection({ system })}
      />
      <Input
        label="Extra CA certificate file (PEM)"
        placeholder="C:\certs\company-root.pem"
        value={caFile}
        onChange={(v) => set(caFileDraft, v)}
        onSubmit={() => void setConnection({ caFile })}
      />
      <KeyValue
        items={[
          { label: 'Node', value: String(c.node) },
          { label: 'System', value: c.system ? String(c.systemCount) : 'off' },
          { label: 'File', value: c.caFile ? String(c.fileCount) : 'none' },
          { label: 'Trusted', value: `${total} certificates` }
        ]}
      />
      <ErrorCallout title="Certificates" text={c.error ?? null} />
      {test ? (
        <Callout tone={test.tone}>
          <Text size="sm">{test.text}</Text>
        </Callout>
      ) : null}
      <Row gap="xs" wrap>
        {edited ? (
          <Button tone="accent" icon="check" onPress={() => setConnection({ caFile })}>
            Apply
          </Button>
        ) : null}
        <Button icon="refresh" onPress={testConnection}>
          Test connection
        </Button>
      </Row>
    </Stack>
  )
}

function HomeView({ me }: { me: Session }) {
  const projects = read(meta)?.projects
  const d = read(dashboard)
  const counts = read(dashCounts)
  return (
    <Stack gap="md">
      <Header title="Backlog" me={me} />
      <Section title="Projects" id="projects">
        {!projects ? (
          <Spinner label="Loading projects" />
        ) : (
          <List label="Projects">
            {projects.map((p) => (
              <ListItem key={p.value} icon="folder" title={p.label} onPress={() => openProject(p.value)} />
            ))}
          </List>
        )}
      </Section>
      <Section title="My Issues" id="myIssues">
        <Stack gap="sm">
          <Segmented
            options={[
              { value: 'assigned', label: 'Assigned to me' },
              { value: 'created', label: 'Created by me' }
            ]}
            value={d.who}
            counts={counts}
            onChange={(who) => setDashboard({ who })}
          />
          <Segmented options={DUE_TABS} value={d.due} counts={counts} onChange={(due) => setDashboard({ due })} />
          <IssueTable
            label="My issues"
            state={read(dashList)}
            columns={['key', 'summary', 'priority', 'status', 'due']}
            sort={d.sort}
            onSort={(sort) => setDashboard({ sort })}
            onLoadMore={() => loadDashboard(true)}
          />
        </Stack>
      </Section>
    </Stack>
  )
}

const SUBTASKING: { value: Subtasking; label: string }[] = [
  { value: '0', label: 'All issues' },
  { value: '4', label: 'Parent issues' },
  { value: '2', label: 'Subtasks only' },
  { value: '1', label: 'Exclude subtasks' },
  { value: '3', label: 'Neither parent nor subtask' }
]

/** Backlog's Advanced Search fields, behind a toggle that shows how many are set. */
function AdvancedFilters() {
  const f = read(filters)
  const m = read(meta)
  const open = read(advancedOpen)
  const count = advancedCount(f)
  const oneProject = f.projectId !== 'all'
  const select = (key: keyof typeof PER_PROJECT | 'createdUserId' | 'resolutionId', label: string, options: readonly Option[]) => (
    <Select
      label={label}
      value={f[key]}
      disabled={!options.length}
      options={withAll(`Any ${label.toLowerCase()}`, options)}
      onChange={(value) => setFilter({ [key]: value })}
    />
  )
  return (
    <Stack gap="xs">
      <Row gap="xs" align="center">
        <Button size="xs" variant="ghost" icon="filter" onPress={() => set(advancedOpen, !open)}>
          {`${open ? 'Hide' : 'Advanced'} filters${count ? ` (${count})` : ''}`}
        </Button>
        {count ? (
          <Button size="xs" variant="ghost" onPress={() => setFilter({ ...ADVANCED })}>
            Clear
          </Button>
        ) : null}
      </Row>
      {open ? (
        <Stack gap="sm">
          {oneProject ? null : (
            <Text muted size="xs">
              Choose a project for Issue type, Category, Version and Milestone.
            </Text>
          )}
          <FilterRow>
            {select('issueTypeId', 'Issue type', m?.issueTypes ?? [])}
            {select('categoryId', 'Category', m?.categories ?? [])}
            {select('versionId', 'Version', m?.versions ?? [])}
            {select('milestoneId', 'Milestone', m?.versions ?? [])}
            {select('createdUserId', 'Registered by', m?.users ?? [])}
            {select('resolutionId', 'Resolution', m?.resolutions ?? [])}
          </FilterRow>
          <Select
            label="Subtasking"
            value={f.parentChild}
            options={SUBTASKING}
            onChange={(parentChild) => setFilter({ parentChild: parentChild as Subtasking })}
          />
          <Row gap="md" wrap>
            <Checkbox label="Attached" checked={f.attachment} onChange={(attachment) => setFilter({ attachment })} />
            <Checkbox label="Shared" checked={f.sharedFile} onChange={(sharedFile) => setFilter({ sharedFile })} />
          </Row>
        </Stack>
      ) : null}
    </Stack>
  )
}

function IssuesView({ me }: { me: Session }) {
  const f = read(filters)
  const m = read(meta)
  const project = m?.projects.find((p) => p.value === f.projectId)?.label ?? 'All projects'
  const l = read(issueList)
  return (
    <Stack gap="sm">
      <Header title={project} back={goHome} me={me} />
      <Row gap="xs" align="center">
        <Text weight="medium">Issues</Text>
        <Badge tone="accent">{l.total}</Badge>
      </Row>
      <Input
        label="Search"
        labelHidden
        type="search"
        placeholder="Search key, summary, description"
        value={f.keyword}
        onChange={typeKeyword}
        onSubmit={() => void loadIssues()}
      />
      <FilterRow>
        <Select
          label="Project"
          labelHidden
          value={f.projectId}
          options={withAll('All projects', m?.projects ?? [])}
          onChange={(projectId) => setFilter({ projectId })}
        />
        <Select
          label="Assignee"
          labelHidden
          value={f.assignee}
          options={fitOptions(
            [
              { value: 'me', label: 'Assigned to me' },
              { value: 'all', label: 'Any assignee' }
            ],
            (m?.users ?? []).filter((u) => u.value !== String(me.me.id))
          )}
          onChange={(assignee) => setFilter({ assignee })}
        />
        <Select
          label="Status"
          labelHidden
          value={f.status}
          options={[{ value: 'notClosed', label: 'Not closed' }, { value: 'all', label: 'All statuses' }, ...(m?.statuses ?? [])]}
          onChange={(status) => setFilter({ status })}
        />
        <Select
          label="Priority"
          labelHidden
          value={f.priorityId}
          options={withAll('All priorities', m?.priorities ?? [])}
          onChange={(priorityId) => setFilter({ priorityId })}
        />
      </FilterRow>
      <AdvancedFilters />
      <IssueTable
        label="Issues"
        state={l}
        columns={['key', 'summary', 'status', 'priority', 'due', 'updated']}
        sort={f.sort}
        onSort={(sort) => setFilter({ sort })}
        onLoadMore={() => void loadIssues(true)}
      />
    </Stack>
  )
}

function LaunchCard({ issue }: { issue: IssueDetail }) {
  const options = read(launchOptions)
  const c = read(choice)
  const draft = read(promptDraft)
  if (!options) return <Spinner label="Loading agents and skills" />
  const skills = options.skills.filter((s) => !s.providers.length || s.providers.includes(c.agent))
  return (
    <Card title="Assign to an agent">
      <Stack gap="sm">
        <FilterRow>
          <Select label="Workspace" value={c.target} options={fitOptions([], options.targets)} onChange={(target) => patch(choice, { target })} />
          <Select label="Agent" value={c.agent} options={options.agents} onChange={(agent) => chooseLaunch(issue.key, { agent })} />
          <Select
            label="Skill"
            value={c.skill || NO_SKILL}
            options={fitOptions([{ value: NO_SKILL, label: 'No skill' }], skills)}
            onChange={(skill) => chooseLaunch(issue.key, { skill: skill === NO_SKILL ? '' : skill })}
          />
        </FilterRow>
        <Textarea
          label={c.skill ? 'Sent to the agent' : 'Prompt'}
          rows={c.skill ? 2 : 8}
          placeholder={draft && !draft.text && !draft.edited ? 'Writing the prompt…' : 'What the agent should do'}
          value={draft?.text ?? ''}
          onChange={(text) => set(promptDraft, { basis: draft?.basis ?? issue.key, text, edited: true })}
          onSubmit={() => void startAgent(issue.key)}
        />
        {draft?.edited ? (
          <Row>
            <Button variant="ghost" size="sm" icon="refresh" onPress={() => refreshPrompt(issue.key, true)}>
              Reset prompt
            </Button>
          </Row>
        ) : null}
        <Button tone="accent" icon="agent" disabled={!c.target || !c.agent || read(launching)} onPress={() => startAgent(issue.key)}>
          {read(launching) ? 'Starting…' : 'Start agent'}
        </Button>
      </Stack>
    </Card>
  )
}

function DetailView({ issueKey }: { issueKey: string }) {
  const { issue, error } = read(detail)
  return (
    <Stack gap="sm">
      <Row justify="between" align="center">
        <Row gap="xs" align="center">
          <BackButton onPress={backFromIssue} />
          <Heading level={2}>{issueKey}</Heading>
        </Row>
        <Row gap="xs">
          <IconButton icon="refresh" label="Reload issue" size="sm" variant="ghost" onPress={() => void openIssue(issueKey)} />
          <IconButton
            icon="open-external"
            label="Open in Backlog"
            size="sm"
            variant="ghost"
            disabled={!issue}
            onPress={() => issue && shell.openExternal(issue.url)}
          />
        </Row>
      </Row>
      <ErrorCallout title="Cannot load issue" text={error} />
      {!issue && !error ? <Spinner label="Loading issue" /> : null}
      {issue ? <IssueBody issue={issue} /> : null}
    </Stack>
  )
}

/** An image reference the worker rewrote: `![alt](attachment:<id>)`. */
const ATTACHMENT_IMAGE = new RegExp(String.raw`!\[([^\]]*)\]\(` + ATTACHMENT_SCHEME + String.raw`(\d+)\)`, 'g')

/**
 * Backlog text with each image reference as a button that opens the image in Orca's preview.
 * Inline pictures would need files inside the plugin folder, which an installed plugin must not change.
 */
function RichText({ content, issueKey }: { content: string; issueKey: string }) {
  const parts: OrcaNode[] = []
  let last = 0
  for (const match of content.matchAll(ATTACHMENT_IMAGE)) {
    const [whole, alt, id] = match
    const text = content.slice(last, match.index)
    if (text.trim()) parts.push(<Markdown key={`t${last}`} content={text} />)
    parts.push(
      <Row key={`i${match.index}`}>
        <Button size="sm" variant="outline" icon="file" onPress={() => openAttachment(issueKey, Number(id))}>
          {`Open preview · ${alt || 'image'}`}
        </Button>
      </Row>
    )
    last = match.index! + whole!.length
  }
  const rest = content.slice(last)
  if (rest.trim()) parts.push(<Markdown key={`t${last}`} content={rest} />)
  return <Stack gap="sm">{parts}</Stack>
}

function LinkedIssues({ issue }: { issue: IssueDetail }) {
  const items = [
    ...(issue.parent ? [{ role: 'Parent', ...issue.parent }] : []),
    ...issue.children.map((c) => ({ role: 'Child', ...c })),
    ...issue.related.map((r) => ({ role: 'Related', ...r }))
  ]
  if (!items.length) return null
  return (
    <Section title={`Linked issues (${items.length})`} id="linkedIssues">
      <List label="Linked issues">
        {items.map((l) => (
          <ListItem
            key={`${l.role}-${l.key}`}
            icon="link"
            title={`${l.key} ${l.summary}`}
            description={`${l.role} · ${l.status}`}
            onPress={() => followIssue(l.key)}
          />
        ))}
      </List>
    </Section>
  )
}

function PullRequests({ issue }: { issue: IssueDetail }) {
  const prs = issue.pullRequests
  return (
    <Section title={`Pull requests (${prs.length})`} id="pullRequests">
      {prs.length ? (
        <List label="Pull requests">
          {prs.map((pr) => (
            <ListItem
              key={pr.key}
              icon="branch"
              title={`#${pr.number} ${pr.summary}`}
              description={`${pr.status} · ${pr.repo}: ${pr.branch} → ${pr.base}${pr.author ? ` · ${pr.author}` : ''}`}
              onPress={() => shell.openExternal(pr.url)}
            />
          ))}
        </List>
      ) : (
        <Text muted size="sm">
          No pull request links this issue.
        </Text>
      )}
    </Section>
  )
}

/** Where agents were started for this issue on this computer; press one to show it. */
function Worktrees({ issue }: { issue: IssueDetail }) {
  const r = read(issueRuns)
  const runs = r?.key === issue.key ? r.runs : []
  const agents = read(launchOptions)?.agents ?? []
  if (!runs.length) return null
  return (
    <Section title={`Worktrees (${runs.length})`} id="worktrees">
      <List label="Worktrees">
        {runs.map((run) => (
          <ListItem
            key={run.workspaceId}
            icon="branch"
            title={run.label}
            description={[
              agents.find((a) => a.value === run.agent)?.label ?? run.agent,
              run.skill,
              run.branch,
              `started ${new Date(run.startedAt).toLocaleString()}`
            ]
              .filter(Boolean)
              .join(' · ')}
            onPress={() => focusRun(run.workspaceId)}
          />
        ))}
      </List>
    </Section>
  )
}

function IssueBody({ issue }: { issue: IssueDetail }) {
  return (
    <Stack gap="sm">
      <Text weight="semibold">{issue.summary}</Text>
      <Row gap="xs" wrap>
        <Badge tone={toneOfColor(issue.typeColor)}>{issue.type}</Badge>
        <Badge tone={statusTone(issue.statusId)}>{issue.status}</Badge>
        {issue.priority ? <Badge tone={issue.priority === 'High' ? 'danger' : 'neutral'}>{issue.priority}</Badge> : null}
      </Row>
      <KeyValue
        items={[
          { label: 'Assignee', value: issue.assignee },
          { label: 'Reporter', value: issue.createdUser },
          { label: 'Start', value: issue.startDate },
          { label: 'Due', value: issue.due },
          { label: 'Milestone', value: issue.milestones.join(', ') || null },
          { label: 'Category', value: issue.categories.join(', ') || null }
        ]}
      />
      <LinkedIssues issue={issue} />
      <PullRequests issue={issue} />
      <Notice />
      <Worktrees issue={issue} />
      <LaunchCard issue={issue} />
      <Section title="Description" id="description">
        {issue.description ? <RichText content={issue.description} issueKey={issue.key} /> : <Text muted>No description.</Text>}
      </Section>
      {issue.attachments.length ? (
        <List label={`Attachments (${issue.attachments.length})`}>
          {issue.attachments.map((a) => (
            <ListItem
              key={String(a.id)}
              icon={ATTACHMENT_ICON[a.kind]}
              title={a.name}
              description={`${size(a.size)} · ${ATTACHMENT_ACTION[a.kind]}`}
              onPress={() => openAttachment(issue.key, a.id)}
            />
          ))}
        </List>
      ) : null}
      <Section title={`Comments (${issue.comments.length})`} id="comments">
        <Stack gap="md">
          {issue.comments.length ? null : <Text muted>No comments.</Text>}
          {issue.comments.map((c, index) => (
            <Stack key={String(c.id)} gap="xs">
              {index ? <Separator /> : null}
              <Row gap="xs" align="center">
                <Text size="sm" weight="semibold">
                  {c.author}
                </Text>
                <RelativeTime at={c.created} muted />
              </Row>
              <RichText content={c.content} issueKey={issue.key} />
            </Stack>
          ))}
        </Stack>
      </Section>
      <UpdateIssue issue={issue} />
    </Stack>
  )
}
const NONE = 'none'
const SEVERAL = 'several'
const DATE = /^\d{4}-\d{2}-\d{2}$/
const badDate = (d: string) => Boolean(d) && !DATE.test(d)
const badHours = (h: string) => Boolean(h.trim()) && !(Number(h) >= 0)

/** A Backlog list field (categories, milestones, versions) as one choice; several stay as they are. */
function OneOf(props: { label: string; ids: string[]; options: Option[]; onChange: (ids: string[]) => void }) {
  const { label, ids, options, onChange } = props
  const several = ids.length > 1
  const first = several
    ? { value: SEVERAL, label: `${ids.length} chosen (edit in Backlog)` }
    : { value: NONE, label: 'None' }
  return (
    <Select
      label={label}
      value={several ? SEVERAL : (ids[0] ?? NONE)}
      disabled={several}
      options={fitOptions([first], options)}
      onChange={(v) => onChange(v === NONE ? [] : [v])}
    />
  )
}

/** An optional single choice, `''` for none. */
function Optional(props: { label: string; none: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  const { label, none, value, options, onChange } = props
  return (
    <Select
      label={label}
      value={value || NONE}
      options={fitOptions([{ value: NONE, label: none }], options)}
      onChange={(v) => onChange(v === NONE ? '' : v)}
    />
  )
}

/** Comment on the issue and change its fields; one save sends both, as Backlog records them. */
function UpdateIssue({ issue }: { issue: IssueDetail }) {
  const form = read(editing)
  const m = read(editMeta)
  if (!form || form.key !== issue.key) return null
  const meta = m?.projectId === issue.projectId ? m.meta : null
  const f = form.fields
  const change = (part: Partial<IssueFields>) => set(editing, { ...form, fields: { ...f, ...part } })
  const changes = changesOf(issue.fields, form)
  const dirty = Object.keys(changes).length > 0
  const fieldCount = Object.keys(changes).filter((c) => c !== 'comment').length
  const busy = read(saving)
  const label = busy
    ? 'Saving…'
    : fieldCount
      ? `Save ${fieldCount} change${fieldCount > 1 ? 's' : ''}${changes.comment ? ' and comment' : ''}`
      : 'Comment'
  return (
    <Section title="Update issue" id="update">
      <Stack gap="sm">
        <Textarea
          label="Comment"
          rows={4}
          placeholder="Add a comment (Backlog formatting)"
          value={form.comment}
          onChange={(comment) => set(editing, { ...form, comment })}
          onSubmit={() => void saveIssue(issue)}
        />
        {!meta ? (
          <Spinner label="Loading statuses and members" />
        ) : (
          <Stack gap="sm">
            <FilterRow>
              <Select label="Status" value={f.statusId} options={fitOptions([], meta.statuses)} onChange={(statusId) => change({ statusId })} />
              <Optional label="Resolution" none="None" value={f.resolutionId} options={meta.resolutions} onChange={(resolutionId) => change({ resolutionId })} />
              <Optional label="Assignee" none="Unassigned" value={f.assigneeId} options={meta.users} onChange={(assigneeId) => change({ assigneeId })} />
            </FilterRow>
            <FilterRow>
              <Select label="Priority" value={f.priorityId} options={fitOptions([], meta.priorities)} onChange={(priorityId) => change({ priorityId })} />
              <Select label="Issue type" value={f.issueTypeId} options={fitOptions([], meta.issueTypes)} onChange={(issueTypeId) => change({ issueTypeId })} />
              <OneOf label="Category" ids={f.categoryIds} options={meta.categories} onChange={(categoryIds) => change({ categoryIds })} />
            </FilterRow>
            <FilterRow>
              <OneOf label="Milestone" ids={f.milestoneIds} options={meta.versions} onChange={(milestoneIds) => change({ milestoneIds })} />
              <OneOf label="Version" ids={f.versionIds} options={meta.versions} onChange={(versionIds) => change({ versionIds })} />
            </FilterRow>
            <FilterRow>
              <Input label="Start date" placeholder="yyyy-MM-dd" value={f.startDate} invalid={badDate(f.startDate)} onChange={(startDate) => change({ startDate })} />
              <Input label="Due date" placeholder="yyyy-MM-dd" value={f.dueDate} invalid={badDate(f.dueDate)} onChange={(dueDate) => change({ dueDate })} />
              <Input label="Estimated hours" value={f.estimatedHours} invalid={badHours(f.estimatedHours)} onChange={(estimatedHours) => change({ estimatedHours })} />
              <Input label="Actual hours" value={f.actualHours} invalid={badHours(f.actualHours)} onChange={(actualHours) => change({ actualHours })} />
            </FilterRow>
            <Input label="Summary" value={f.summary} invalid={!f.summary.trim()} onChange={(summary) => change({ summary })} />
            <Textarea label="Description" rows={8} value={f.description} onChange={(description) => change({ description })} />
          </Stack>
        )}
        <ErrorCallout title="Cannot save" text={read(saveError)} />
        <Row gap="xs" wrap>
          <Button tone="accent" icon="check" disabled={busy || !dirty} onPress={() => saveIssue(issue)}>
            {label}
          </Button>
          <Button variant="ghost" disabled={busy || !dirty} onPress={() => startEditing(issue)}>
            Discard
          </Button>
        </Row>
      </Stack>
    </Section>
  )
}

export default function Panel() {
  const s = read(session)
  const key = read(openKey)
  if (s === undefined) return <Spinner label="Connecting to Backlog" />
  if (!s) return <LoginView />
  if (key) return <DetailView issueKey={key} />
  const now = read(screen)
  return now === 'settings' ? <SettingsView /> : now === 'home' ? <HomeView me={s} /> : <IssuesView me={s} />
}
