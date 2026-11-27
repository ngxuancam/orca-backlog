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
  Link,
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
  type TableCell,
  type TableColumn,
  type TableSort,
  type Tone
} from 'orca'
import type {
  AiAnswer,
  PendingFile,
  Account,
  AccountSettings,
  AuditEntry,
  ConflictCheck,
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
  PullRequest,
  Session,
  SortKey,
  Subtasking
} from './protocol'
import { ATTACHMENT_SCHEME, PR_OPEN } from './protocol'

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
const screen = atom<'home' | 'issues' | 'settings' | 'ai'>('screen', 'home', { persist: 'plugin' })
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
/** Where a result shows: next to the control that asked for it. */
type Place = 'ai' | 'header' | 'fields' | 'links' | 'pullRequests' | 'myPullRequests' | 'worktrees' | 'attachments' | 'description' | 'comments' | 'launch'
/** The last action's result, shown inline at its place; a success fades after a few seconds. */
const notice = atom<{ place: Place; tone: Tone; text: string } | null>(null)
let noticeTimer: ReturnType<typeof setTimeout> | undefined
const SUCCESS_FADES_MS = 4000
function say(place: Place, tone: Tone, text: string): void {
  clearTimeout(noticeTimer)
  const next = { place, tone, text }
  set(notice, next)
  if (tone === 'success') noticeTimer = setTimeout(() => read(notice) === next && set(notice, null), SUCCESS_FADES_MS)
}

const launchOptions = atom<LaunchOptions | null>(null)
/** The last choices survive restarts, so the next issue starts the same way. */
const choice = atom('launchChoice', { target: '', agent: '', skill: '' }, { persist: 'plugin' })
const launching = atom(false)
/** Which collapsible sections are closed; kept across screens and restarts. */
const closedSections = atom<string[]>('closedSections', [], { persist: 'plugin' })
const NO_SKILL = 'none'
/** The open issue's edit form: fields as typed and a comment. */
const editing = atom<{ key: string; fields: IssueFields; comment: string; files: PendingFile[] } | null>(null)
/** The Backlog AI chat on Home: questions and answers of one thread, newest last. */
const aiChat = atom<{ threadId: string | null; title: string | null; turns: { question: string; answer: AiAnswer }[]; more?: boolean }>({
  threadId: null,
  title: null,
  turns: []
})
/** The chat history, and how much of the month's credit is used. */
const aiHistory = atom<{ threads: { id: string; title: string; updated: number }[]; usage: { state: string; percent: number | null } | null } | null>(null)
/** The history list in place of the chat (the panel is too narrow for both side by side). */
const aiShowHistory = atom(false)
const aiSearch = atom('')
/** A chat being read from Backlog. */
const aiLoading = atom<string | null>(null)
const aiDraft = atom('')
/** The question being answered, while it is. */
const aiAsking = atom<string | null>(null)
/** Whether the space has the assistant; the entry to it shows only when it does. */
const aiStatus = atom<'available' | 'unavailable' | 'signedOut' | 'unknown' | null>(null)
/** Older answers the person opened again (the latest is always open). */
const aiOpenTurns = atom<number[]>([])

/** Waiting for the clipboard or the OS's open dialog. */
const picking = atom(false)
/** Statuses, members, types… of the open issue's project, for the edit form. */
const editMeta = atom<{ projectId: number; meta: Meta } | null>(null)
const saving = atom(false)
/** The link whose actions show, and the list it was picked in (the bar shows under that list). */
const pickedLink = atom<{ list: string; url: string } | null>(null)
/** Summary and description are edited in place, from the header's edit button. */
const editingText = atom(false)
/** The bottom sheet with the other fields and the comment. */
const sheetOpen = atom('updateSheetOpen', false, { persist: 'plugin' })
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
/** Table column → Backlog `sort`. Keys sort as creation order, which is how Backlog numbers them. */
const SORT_BY: Record<string, SortKey> = {
  key: 'created',
  type: 'issueType',
  summary: 'summary',
  assignee: 'assignee',
  status: 'status',
  priority: 'priority',
  created: 'created',
  startDate: 'startDate',
  due: 'dueDate',
  updated: 'updated',
  createdUser: 'createdUser',
  updatedUser: 'updatedUser',
  category: 'category',
  milestone: 'milestone',
  version: 'version',
  estimatedHours: 'estimatedHours',
  actualHours: 'actualHours'
}

/** Every column a table can show, in Backlog's order; the person picks which (Columns). */
const COLUMNS: Record<string, TableColumn> = {
  key: { key: 'key', label: 'Key', width: 'sm', sortable: true },
  type: { key: 'type', label: 'Type', width: 'sm', sortable: true },
  summary: { key: 'summary', label: 'Summary', minWidth: 'md', sortable: true },
  assignee: { key: 'assignee', label: 'Assignee', width: 'sm', sortable: true },
  status: { key: 'status', label: 'Status', width: 'sm', sortable: true, hideBelow: 'sm' },
  priority: { key: 'priority', label: 'Priority', width: 'xs', sortable: true, hideBelow: 'md' },
  created: { key: 'created', label: 'Registered', width: 'sm', sortable: true },
  startDate: { key: 'startDate', label: 'Start', width: 'sm', sortable: true },
  due: { key: 'due', label: 'Due', width: 'sm', sortable: true, hideBelow: 'md' },
  updated: { key: 'updated', label: 'Updated', width: 'sm', sortable: true, hideBelow: 'sm' },
  createdUser: { key: 'createdUser', label: 'Registered by', width: 'sm', sortable: true },
  updatedUser: { key: 'updatedUser', label: 'Updated by', width: 'sm', sortable: true },
  category: { key: 'category', label: 'Category', width: 'sm', sortable: true },
  milestone: { key: 'milestone', label: 'Milestone', width: 'sm', sortable: true },
  version: { key: 'version', label: 'Version', width: 'sm', sortable: true },
  resolution: { key: 'resolution', label: 'Resolution', width: 'sm' },
  estimatedHours: { key: 'estimatedHours', label: 'Estimated', width: 'xs', align: 'end', sortable: true },
  actualHours: { key: 'actualHours', label: 'Actual', width: 'xs', align: 'end', sortable: true }
}
const COLUMN_ORDER = Object.keys(COLUMNS)

/** A row's cell for each column. */
function cellsOf(r: IssueRow): Record<string, TableCell> {
  return {
    key: r.key,
    type: r.type,
    summary: r.summary,
    assignee: r.assignee,
    status: r.status,
    priority: r.priority,
    created: { type: 'relative', at: r.created, format: 'short' },
    startDate: r.startDate,
    due: r.due,
    updated: { type: 'relative', at: r.updated, format: 'short' },
    createdUser: r.createdUser,
    updatedUser: r.updatedUser,
    category: r.category,
    milestone: r.milestone,
    version: r.version,
    resolution: r.resolution,
    estimatedHours: r.estimatedHours,
    actualHours: r.actualHours
  }
}

/** Which columns each table shows, kept per table; Key always stays so a row can be opened. */
const shownColumns = atom<Record<string, string[]>>('shownColumns', {}, { persist: 'plugin' })
/** Widths the person set, per table and column. Not kept: leaving the list for another screen
 *  resets them, while opening an issue and coming Back keeps them. */
type ColumnWidth = NonNullable<TableColumn['width']>
const columnWidths = atom<Record<string, Record<string, ColumnWidth>>>({})
const WIDTH_OPTIONS: Option[] = [
  { value: 'default', label: 'Default width' },
  { value: 'xs', label: 'XS' },
  { value: 'sm', label: 'S' },
  { value: 'md', label: 'M' },
  { value: 'lg', label: 'L' },
  { value: 'auto', label: 'Fill' }
]

function setWidth(table: string, column: string, width: string): void {
  const all = read(columnWidths)
  const mine = { ...all[table] }
  if (width === 'default') delete mine[column]
  else mine[column] = width as ColumnWidth
  set(columnWidths, { ...all, [table]: mine })
}

/** A column as the table draws it: its definition with the width the person set. */
function columnOf(table: string, column: string): TableColumn {
  const width = read(columnWidths)[table]?.[column]
  const { hideBelow: _, ...base } = COLUMNS[column]!
  // An explicit width also keeps it when narrow: a column the person sized is one they want.
  return width ? { ...base, width } : COLUMNS[column]!
}

/** Back to the default columns and widths; the choice is otherwise kept. */
function resetColumns(table: string): void {
  const { [table]: _, ...shown } = read(shownColumns)
  set(shownColumns, shown)
  const { [table]: __, ...widths } = read(columnWidths)
  set(columnWidths, widths)
}

/** The open picker: `<table>:columns` or `<table>:widths`. */
const pickingColumns = atom<string | null>(null)

/** Whether the table's columns or widths differ from its defaults. */
const customised = (table: string) => Boolean(read(shownColumns)[table] || Object.keys(read(columnWidths)[table] ?? {}).length)

function columnsOf(table: string, defaults: readonly string[]): string[] {
  const chosen = read(shownColumns)[table] ?? defaults
  return COLUMN_ORDER.filter((c) => c === 'key' || chosen.includes(c))
}

function toggleColumn(table: string, defaults: readonly string[], column: string, on: boolean): void {
  const now = columnsOf(table, defaults)
  const next = on ? [...now, column] : now.filter((c) => c !== column)
  set(shownColumns, { ...read(shownColumns), [table]: COLUMN_ORDER.filter((c) => next.includes(c)) })
}

/** Backlog's "columns" setting: a checkbox per field, open under the table's Columns button. */
function ColumnPicker({ table, defaults }: { table: string; defaults: readonly string[] }) {
  if (read(pickingColumns) !== `${table}:columns`) return null
  const shown = columnsOf(table, defaults)
  return (
    <Box border radius="md" padding="sm" gap="sm">
      <Box columns={3} gap="xs">
        {COLUMN_ORDER.map((c) => (
          <Checkbox
            key={c}
            label={COLUMNS[c]!.label}
            checked={shown.includes(c)}
            disabled={c === 'key'}
            onChange={(on) => toggleColumn(table, defaults, c, on)}
          />
        ))}
      </Box>
      <Row justify="end">
        <Button size="sm" variant="ghost" onPress={() => set(pickingColumns, null)}>
          Done
        </Button>
      </Row>
    </Box>
  )
}

/**
 * Widths of the shown columns: the name on the left, its width on the right. Orca's Table has
 * no drag-to-resize, only these sizes.
 */
function WidthPicker({ table, defaults }: { table: string; defaults: readonly string[] }) {
  if (read(pickingColumns) !== `${table}:widths`) return null
  return (
    <Box border radius="md" padding="sm" gap="xs">
      {columnsOf(table, defaults).map((c) => (
        <Row key={c} gap="sm" align="center">
          <Box grow minWidth={0}>
            <Text size="sm" truncate>
              {COLUMNS[c]!.label}
            </Text>
          </Box>
          <Box width={130} shrink={false}>
            <Select
              label={`${COLUMNS[c]!.label} width`}
              labelHidden
              value={read(columnWidths)[table]?.[c] ?? 'default'}
              options={WIDTH_OPTIONS}
              onChange={(w) => setWidth(table, c, w)}
            />
          </Box>
        </Row>
      ))}
      <Row gap="xs" align="center">
        <Box grow minWidth={0}>
          <Text muted size="xs">
            Widths last until you leave this list.
          </Text>
        </Box>
        <Button size="sm" variant="ghost" onPress={() => set(pickingColumns, null)}>
          Done
        </Button>
      </Row>
    </Box>
  )
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
  goTo('issues')
  setFilter({ projectId, keyword: '' })
}

/** Moves to another screen; set widths only last while the person stays on one. */
function goTo(next: 'home' | 'issues' | 'settings' | 'ai'): void {
  if (read(screen) !== next) {
    set(columnWidths, {})
    set(pickingColumns, null)
  }
  set(screen, next)
}

function goHome(): void {
  goTo('home')
  loadDashboard()
  void loadMyPrs()
  void loadAiStatus()
}

function refresh(): void {
  const now = read(screen)
  if (now === 'home') {
    loadDashboard()
    void loadMyPrs()
    void loadAiStatus(true)
  }
  else if (now === 'issues') void loadIssues()
  else void loadSettings()
}

let keywordTimer: ReturnType<typeof setTimeout> | undefined
function typeKeyword(keyword: string): void {
  patch(filters, { keyword })
  clearTimeout(keywordTimer)
  keywordTimer = setTimeout(() => void loadIssues(), 350)
}

// --- Pull requests -------------------------------------------------------------------------------

/** Conflict checks by `PullRequest.key`; kept while the panel is open, redone on each load. */
const prChecks = atom<Record<string, ConflictCheck | 'checking'>>({})
/** My open pull requests, for Home. */
const myPrs = atom<{ prs: PullRequest[] | null; loading: boolean; error: string | null }>({ prs: null, loading: false, error: null })

/** Asks git whether the open ones conflict; the badges show "Checking…" until it answers. */
async function checkConflicts(prs: PullRequest[]): Promise<void> {
  const keys = prs.filter((pr) => pr.statusId === PR_OPEN).map((pr) => pr.key)
  if (!keys.length) return
  set(prChecks, { ...read(prChecks), ...Object.fromEntries(keys.map((k) => [k, 'checking' as const])) })
  // One at a time: each fetch can take a while, and a request has two minutes at most.
  for (const key of keys) {
    let check: ConflictCheck
    try {
      check = (await plugin.request('pullRequests.conflicts', { keys: [key] }, { timeoutMs: 120_000 }))[key] ?? {
        state: 'unknown',
        reason: 'No answer for this pull request.'
      }
    } catch (error) {
      check = { state: 'unknown', reason: message(error) }
    }
    set(prChecks, { ...read(prChecks), [key]: check })
  }
}

let myPrsSeq = 0
async function loadMyPrs(): Promise<void> {
  const seq = ++myPrsSeq
  patch(myPrs, { loading: true, error: null })
  try {
    const prs = await plugin.request('pullRequests.mine', undefined, { timeoutMs: 120_000 })
    if (seq !== myPrsSeq) return
    set(myPrs, { prs, loading: false, error: null })
    void checkConflicts(prs)
  } catch (error) {
    if (seq === myPrsSeq) patch(myPrs, { loading: false, error: message(error) })
  }
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
    if (read(screen) === 'issues') goTo('home')
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
  goTo('settings')
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
  set(pickedLink, null)
  set(detail, { issue: null, error: null })
  set(notice, null)
  try {
    const issue = await plugin.request('issue.get', { key }, { timeoutMs: 120_000 })
    if (read(openKey) === key) {
      set(detail, { issue, error: null })
      startEditing(issue)
      void checkConflicts(issue.pullRequests)
    }
  } catch (error) {
    if (read(openKey) === key) set(detail, { issue: null, error: message(error) })
  }
  void loadRuns(key)
  if (!read(launchOptions)) await loadLaunchOptions()
  if (read(openKey) === key) void refreshPrompt(key, true)
}

/** The header edits these two; the bottom sheet the rest and the comment. */
const TEXT_FIELDS: readonly (keyof IssueFields)[] = ['summary', 'description']
type EditPart = 'text' | 'fields'
const inPart = (part: EditPart, name: string) => (part === 'text') === TEXT_FIELDS.includes(name as keyof IssueFields)

function startEditing(issue: IssueDetail): void {
  const before = read(editing)
  if (before?.files.length) void plugin.request('files.drop', { ids: before.files.map((f) => f.id) }).catch(() => undefined)
  set(editing, { key: issue.key, fields: issue.fields, comment: '', files: [] })
  set(editingText, false)
  if (read(editMeta)?.projectId !== issue.projectId) void loadEditMeta(issue.projectId)
}

async function loadEditMeta(projectId: number): Promise<void> {
  set(editMeta, null)
  try {
    set(editMeta, { projectId, meta: await plugin.request('meta.get', { projectId: String(projectId) }) })
  } catch (error) {
    say('fields', 'danger', `Cannot load the project's statuses and members: ${message(error)}`)
  }
}

const sameValue = (a: string | string[], b: string | string[]) => JSON.stringify(a) === JSON.stringify(b)

/** What the form changed in one part, field by field; the fields part carries the comment. */
export function changesOf(
  from: IssueFields,
  form: { fields: IssueFields; comment: string; files?: PendingFile[] },
  part: EditPart
): IssueChanges {
  const changes: Record<string, string | string[]> = {}
  for (const [name, value] of Object.entries(form.fields) as [keyof IssueFields, string | string[]][]) {
    if (inPart(part, name) && !sameValue(value, from[name])) changes[name] = value
  }
  const files = part === 'fields' ? (form.files ?? []).map((f) => f.id) : []
  return {
    ...changes,
    ...(part === 'fields' && form.comment.trim() ? { comment: form.comment } : {}),
    ...(files.length ? { files } : {})
  }
}

/** Asks Backlog AI in the chat's thread; the answer joins the chat. */
async function askAi(): Promise<void> {
  const question = read(aiDraft).trim()
  if (!question || read(aiAsking)) return
  const { threadId } = read(aiChat)
  set(aiAsking, question)
  set(aiDraft, '')
  try {
    // An answer can take a while: the assistant searches issues and wikis first.
    const answer = await plugin.request('ai.ask', { question, threadId }, { timeoutMs: 120_000 })
    const chat = read(aiChat)
    set(aiChat, { ...chat, threadId: answer.threadId ?? chat.threadId, turns: [...chat.turns, { question, answer }] })
    // Backlog names a new chat a few seconds after its first answer.
    if (!chat.threadId) setTimeout(() => void loadAiHistory(), 4000)
    else void loadAiHistory()
  } catch (error) {
    if (!read(aiDraft)) set(aiDraft, question)
    say('ai', 'danger', message(error))
  } finally {
    set(aiAsking, null)
  }
}

async function loadAiStatus(recheck = false): Promise<void> {
  try {
    set(aiStatus, (await plugin.request('ai.status', { recheck }, { timeoutMs: 60_000 })).state)
  } catch {
    set(aiStatus, 'unknown')
  }
}

function newAiChat(): void {
  set(aiChat, { threadId: null, title: null, turns: [] })
  set(aiOpenTurns, [])
  set(aiShowHistory, false)
}

function openAi(): void {
  goTo('ai')
  void loadAiHistory()
}

async function loadAiHistory(): Promise<void> {
  try {
    const history = await plugin.request('ai.history', undefined, { timeoutMs: 60_000 })
    set(aiHistory, history)
    const chat = read(aiChat)
    const title = history.threads.find((t) => t.id === chat.threadId)?.title
    if (title && title !== chat.title) set(aiChat, { ...chat, title })
  } catch (error) {
    say('ai', 'danger', message(error))
  }
}

async function openAiThread(thread: { id: string; title: string }): Promise<void> {
  if (read(aiAsking)) return
  set(aiShowHistory, false)
  set(aiLoading, thread.id)
  try {
    const { turns, more } = await plugin.request('ai.thread', { threadId: thread.id }, { timeoutMs: 60_000 })
    set(aiChat, { threadId: thread.id, title: thread.title, turns, more })
    set(aiOpenTurns, [])
  } catch (error) {
    say('ai', 'danger', message(error))
  } finally {
    set(aiLoading, null)
  }
}

async function copyAnswer(text: string): Promise<void> {
  try {
    await plugin.request('ai.copy', { text })
    say('ai', 'success', 'Copied the answer.')
  } catch (error) {
    say('ai', 'danger', message(error))
  }
}

async function openAiOnWeb(): Promise<void> {
  try {
    await plugin.request('ai.open', { threadId: read(aiChat).threadId }, { timeoutMs: 60_000 })
  } catch (error) {
    say('ai', 'danger', message(error))
  }
}

/** Adds the clipboard's image, or files from the OS's open dialog, to the comment. */
async function addFiles(issue: IssueDetail, how: 'paste' | 'choose'): Promise<void> {
  if (read(picking)) return
  set(picking, true)
  try {
    const got =
      how === 'paste'
        ? await plugin.request('files.paste', undefined, { timeoutMs: 60_000 })
        : { files: await plugin.request('files.choose', undefined, { timeoutMs: 120_000 }) }
    const form = read(editing)
    if (!form || form.key !== issue.key) {
      if (got.files.length) void plugin.request('files.drop', { ids: got.files.map((f) => f.id) }).catch(() => undefined)
      return
    }
    if ('message' in got && got.message) say('fields', 'warning', got.message)
    if (got.files.length) set(editing, { ...form, files: [...form.files, ...got.files] })
  } catch (error) {
    say('fields', 'danger', message(error))
  } finally {
    set(picking, false)
  }
}

function removeFile(issue: IssueDetail, id: string): void {
  const form = read(editing)
  if (!form || form.key !== issue.key) return
  set(editing, { ...form, files: form.files.filter((f) => f.id !== id) })
  void plugin.request('files.drop', { ids: [id] }).catch(() => undefined)
}

async function saveIssue(issue: IssueDetail, part: EditPart): Promise<void> {
  const form = read(editing)
  if (!form || form.key !== issue.key || read(saving)) return
  const changes = changesOf(issue.fields, form, part)
  if (!Object.keys(changes).length) return
  set(saving, true)
  try {
    const next = await plugin.request('issue.update', { key: issue.key, changes }, { timeoutMs: 120_000 })
    if (read(openKey) !== issue.key) return
    set(detail, { issue: next, error: null })
    // The other part's edits are not saved yet: keep them over what Backlog answered.
    const kept = Object.fromEntries(
      (Object.keys(form.fields) as (keyof IssueFields)[])
        .filter((name) => !inPart(part, name) && !sameValue(form.fields[name], issue.fields[name]))
        .map((name) => [name, form.fields[name]])
    )
    set(editing, {
      key: next.key,
      fields: { ...next.fields, ...kept },
      comment: part === 'fields' ? '' : form.comment,
      files: part === 'fields' ? [] : form.files
    })
    if (part === 'text') set(editingText, false)
    const fields = Object.keys(changes).filter((c) => c !== 'comment' && c !== 'files').length
    const attached = changes.files?.length ?? 0
    const parts = [
      fields ? `Saved ${fields} field${fields > 1 ? 's' : ''}` : null,
      changes.comment || attached ? 'comment added' : null,
      attached ? `${attached} file${attached > 1 ? 's' : ''} attached` : null
    ]
    say(part === 'text' ? 'header' : 'fields', 'success', `${parts.filter(Boolean).join(', ')}.`)
    refresh()
  } catch (error) {
    say(part === 'text' ? 'header' : 'fields', 'danger', message(error))
  } finally {
    set(saving, false)
  }
}

/** Copy, the OS browser or Orca's own browser: the choices a link's right-click would offer. */
async function linkAction(place: Place, url: string, how: 'copy' | 'browser' | 'orca'): Promise<void> {
  try {
    if (how === 'browser') {
      const { opened } = await shell.openExternal(url)
      if (!opened) return
    } else if (how === 'copy') await plugin.request('link.copy', { url })
    else await plugin.request('link.openInOrca', { url }, { timeoutMs: 60_000 })
    const done = { copy: 'Copied', browser: 'Opened in the browser', orca: "Opened in Orca's browser" }[how]
    say(place, 'success', `${done}: ${url}`)
  } catch (error) {
    say(place, 'danger', message(error))
  }
}

async function loadRuns(key: string): Promise<void> {
  try {
    const runs = await plugin.request('runs.get', { key })
    if (read(openKey) === key) set(issueRuns, { key, runs })
  } catch (error) {
    say('launch', 'danger', `Cannot list the issue's worktrees: ${message(error)}`)
  }
}

async function focusRun(workspaceId: string): Promise<void> {
  try {
    await plugin.request('runs.focus', { workspaceId })
  } catch (error) {
    say('worktrees', 'danger', message(error))
  }
}

/** The worktree picked to link to the open issue. */
const linkTarget = atom('')

async function linkRun(key: string, workspaceId: string, how: 'link' | 'unlink'): Promise<void> {
  try {
    const runs = await plugin.request(how === 'link' ? 'runs.link' : 'runs.unlink', { key, workspaceId })
    if (read(openKey) === key) set(issueRuns, { key, runs })
    if (how === 'link') set(linkTarget, '')
  } catch (error) {
    say('worktrees', 'danger', message(error))
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
    say('launch', 'danger', `Cannot write the prompt: ${message(error)}`)
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
    say('launch', 'danger', `Cannot list agents and skills: ${message(error)}`)
  }
}

async function openAttachment(key: string, attachmentId: number, place: Place = 'attachments'): Promise<void> {
  say(place, 'neutral', 'Downloading…')
  try {
    const result = await plugin.request('attachment.open', { key, attachmentId }, { timeoutMs: 120_000 })
    const how = { preview: 'Opened in Orca', folder: 'Saved and opened its folder', external: 'Opened with the system viewer' }
    say(place, 'success', `${how[result.mode]}: ${result.path}`)
  } catch (error) {
    say(place, 'danger', message(error))
  }
}

async function startAgent(key: string): Promise<void> {
  const { target, agent, skill } = read(choice)
  const prompt = read(promptDraft)?.text.trim()
  set(launching, true)
  say('launch', 'neutral', 'Starting the agent…')
  try {
    await plugin.request(
      'launch.start',
      { key, target, agent, ...(skill ? { skill } : {}), ...(prompt ? { prompt } : {}) },
      { timeoutMs: 120_000 }
    )
    void loadRuns(key)
    const label = read(launchOptions)?.agents.find((a) => a.value === agent)?.label ?? agent
    say('launch', 'success', `${label} started on ${key}${skill ? ` with ${skill}` : ''}.`)
  } catch (error) {
    say('launch', 'danger', message(error))
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
  /** Names the table's own column choice. */
  table: string
  /** Shown until the person picks. */
  columns: readonly string[]
  sort: TableSort
  onSort: (sort: TableSort) => void
  onLoadMore: () => void
}) {
  const { state } = props
  const columns = columnsOf(props.table, props.columns)
  const picking = read(pickingColumns)
  const toggle = (what: 'columns' | 'widths') => {
    const id = `${props.table}:${what}`
    set(pickingColumns, picking === id ? null : id)
  }
  return (
    <Stack gap="xs">
      <ErrorCallout title="Backlog" text={state.error} />
      <Row justify="end" gap="xs">
        <Button size="sm" variant="ghost" icon="refresh" disabled={!customised(props.table)} onPress={() => resetColumns(props.table)}>
          Reset columns
        </Button>
        <Button size="sm" variant="ghost" icon="expand" onPress={() => toggle('widths')}>
          Widths
        </Button>
        <Button size="sm" variant="ghost" icon="settings" onPress={() => toggle('columns')}>
          {`Columns (${columns.length})`}
        </Button>
      </Row>
      <ColumnPicker table={props.table} defaults={props.columns} />
      <WidthPicker table={props.table} defaults={props.columns} />
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
        columns={columns.map((c) => columnOf(props.table, c))}
        rows={state.rows.map((r) => ({ key: r.key, cells: cellsOf(r) }))}
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
          {read(aiStatus) === 'available' ? (
            <IconButton icon="bot" label="Ask Backlog AI" size="sm" variant="ghost" onPress={openAi} />
          ) : null}
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

/** My open pull requests in every project, each with its conflict check. */
function MyPullRequests() {
  const { prs, loading, error } = read(myPrs)
  const checks = read(prChecks)
  const conflicts = (prs ?? []).filter((pr) => (checks[pr.key] as ConflictCheck | undefined)?.state === 'conflict').length
  return (
    <Section title={`My pull requests${prs ? ` (${prs.length})` : ''}`} id="myPullRequests">
      <Stack gap="sm">
        <ErrorCallout title="Backlog" text={error} />
        {conflicts ? (
          <Text tone="danger" size="sm">
            {conflicts === 1 ? '1 pull request has conflicts.' : `${conflicts} pull requests have conflicts.`}
          </Text>
        ) : null}
        {!prs ? (
          loading ? <Spinner label="Loading pull requests" /> : null
        ) : prs.length ? (
          prs.map((pr) => (
            <LinkRow
              key={pr.key}
              list="myPullRequests"
              url={pr.url}
              check={checks[pr.key]}
              title={`#${pr.number} ${pr.summary}`}
              description={`${pr.project ? `${pr.project} · ` : ''}${pr.repo}: ${pr.branch} → ${pr.base}`}
            />
          ))
        ) : (
          <Text muted size="sm">
            No open pull request of yours.
          </Text>
        )}
        <Notice place="myPullRequests" />
      </Stack>
    </Section>
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
      <AiSignInHint />
      <MyPullRequests />
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
            table="home"
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
        table="issues"
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
        <Notice place="launch" />
      </Stack>
    </Card>
  )
}

/**
 * A column the panel's height: the header stays at the top, the body scrolls between it and the
 * update sheet at the bottom.
 */
function DetailView({ issueKey }: { issueKey: string }) {
  const { issue, error } = read(detail)
  return (
    <Box height="100%" gap="sm">
      <Box shrink={false} gap="xs">
        <DetailHeader issueKey={issueKey} issue={issue} />
      </Box>
      <Box grow minHeight={0} scroll="y" gap="sm">
        <ErrorCallout title="Cannot load issue" text={error} />
        {!issue && !error ? <Spinner label="Loading issue" /> : null}
        {issue ? <IssueBody issue={issue} /> : null}
      </Box>
      {issue ? <UpdateSheet issue={issue} /> : null}
    </Box>
  )
}

function DetailHeader({ issueKey, issue }: { issueKey: string; issue: IssueDetail | null }) {
  const form = read(editing)
  const text = read(editingText) && issue && form?.key === issue.key
  const changes = issue && form?.key === issue.key ? changesOf(issue.fields, form, 'text') : {}
  const busy = read(saving)
  return (
    <Stack gap="xs">
      <Row justify="between" align="center">
        <Row gap="xs" align="center">
          <BackButton onPress={backFromIssue} />
          <Heading level={2}>{issueKey}</Heading>
        </Row>
        <Row gap="xs">
          {text ? (
            <IconButton
              icon="check"
              label="Save summary and description"
              size="sm"
              tone="accent"
              disabled={busy || !Object.keys(changes).length || !form.fields.summary.trim()}
              onPress={() => issue && saveIssue(issue, 'text')}
            />
          ) : (
            <IconButton icon="edit" label="Edit summary and description" size="sm" variant="ghost" disabled={!issue} onPress={() => set(editingText, true)} />
          )}
          {text ? (
            <IconButton icon="close" label="Cancel editing" size="sm" variant="ghost" disabled={busy} onPress={() => issue && cancelText(issue)} />
          ) : null}
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
      {!issue ? null : text ? (
        <Input
          label="Summary"
          labelHidden
          value={form.fields.summary}
          invalid={!form.fields.summary.trim()}
          onChange={(summary) => set(editing, { ...form, fields: { ...form.fields, summary } })}
          onSubmit={() => void saveIssue(issue, 'text')}
        />
      ) : (
        <Text weight="semibold">{issue.summary}</Text>
      )}
      <Notice place="header" />
    </Stack>
  )
}

/** Leaves edit mode with the summary and description as Backlog has them. */
function cancelText(issue: IssueDetail): void {
  const form = read(editing)
  if (form?.key === issue.key) {
    set(editing, { ...form, fields: { ...form.fields, summary: issue.fields.summary, description: issue.fields.description } })
  }
  set(editingText, false)
}

/** An image reference the worker rewrote: `![alt](attachment:<id>)`. */
const ATTACHMENT_IMAGE = new RegExp(String.raw`!\[([^\]]*)\]\(` + ATTACHMENT_SCHEME + String.raw`(\d+)\)`, 'g')

/**
 * Backlog text with each image reference as a button that opens the image in Orca's preview.
 * Inline pictures would need files inside the plugin folder, which an installed plugin must not change.
 */
function RichText({ content, issueKey, place }: { content: string; issueKey: string; place: Place }) {
  const parts: OrcaNode[] = []
  let last = 0
  for (const match of content.matchAll(ATTACHMENT_IMAGE)) {
    const [whole, alt, id] = match
    const text = content.slice(last, match.index)
    if (text.trim()) parts.push(<Markdown key={`t${last}`} content={text} />)
    parts.push(
      <Row key={`i${match.index}`}>
        <Button size="sm" variant="outline" icon="file" onPress={() => openAttachment(issueKey, Number(id), place)}>
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

/** Tool names as the assistant reports them (`search-issues-tool`) → `search issues`. */
const toolLabel = (name: string) => name.replace(/-tool$/, '').replace(/[-_]+/g, ' ')

/** Signed out in Orca's browser, the plan is unknown: say how to find out, once. */
function AiSignInHint() {
  if (read(aiStatus) !== 'signedOut') return null
  return (
    <Row gap="xs" align="center" wrap>
      <Text muted size="sm">
        Sign in to Backlog in Orca's browser to see whether Backlog AI is available.
      </Text>
      <Button size="xs" variant="ghost" icon="open-external" onPress={openAiOnWeb}>
        Sign in
      </Button>
      <Button size="xs" variant="ghost" icon="refresh" onPress={() => loadAiStatus(true)}>
        Check again
      </Button>
    </Row>
  )
}

/** The chat's title: its first question, as Backlog names a thread after it. */
const chatTitle = (question: string) => (question.length > 48 ? `${question.slice(0, 47)}…` : question)

/** "3 h ago", "2 d ago": when a chat was last used. */
function ago(time: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60_000))
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`
}

/** The month's credit, as Backlog warns about it. */
function CreditNotice() {
  const usage = read(aiHistory)?.usage
  if (!usage || (usage.state !== 'warning' && usage.state !== 'unavailable')) return null
  const used = usage.percent === null ? '' : ` (${usage.percent}% used)`
  return usage.state === 'unavailable' ? (
    <Callout tone="danger" title="Out of AI credits for the month">
      {`Backlog AI is unavailable until the 1st of next month${used}.`}
    </Callout>
  ) : (
    <Callout tone="warning" title="Almost out of AI credits for the month">
      {`Once the limit is hit, your organization loses the assistant until the 1st of next month${used}.`}
    </Callout>
  )
}

/** The chat history: search, New chat, and the chats newest first. */
function AiHistoryList() {
  const history = read(aiHistory)
  const search = read(aiSearch).trim().toLowerCase()
  const current = read(aiChat).threadId
  const threads = (history?.threads ?? []).filter((t) => !search || t.title.toLowerCase().includes(search))
  return (
    <Stack gap="sm">
      <Input label="Search chat history" labelHidden type="search" placeholder="Search chat history" value={read(aiSearch)} onChange={(v) => set(aiSearch, v)} />
      <Row justify="between" align="center">
        <Text weight="medium" size="sm">
          Chat history
        </Text>
        <Button size="xs" variant="ghost" icon="add" onPress={newAiChat}>
          New chat
        </Button>
      </Row>
      {!history ? (
        <Spinner label="Loading chats" />
      ) : threads.length ? (
        <List label="Chat history">
          {threads.map((t) => (
            <ListItem
              key={t.id}
              icon={t.id === current ? 'check' : undefined}
              title={t.title}
              description={t.updated ? ago(t.updated) : undefined}
              onPress={() => openAiThread(t)}
            />
          ))}
        </List>
      ) : (
        <Text muted>{search ? 'No chat matches.' : 'No chats yet.'}</Text>
      )}
    </Stack>
  )
}

/**
 * The Backlog AI Assistant as its own screen, laid out like Backlog's chat: the history a press
 * away, questions in bubbles on the right, answers as text on the left, the box pinned at the
 * bottom. Older answers fold so the latest stays in view (the panel cannot scroll itself).
 */
function AiView() {
  const chat = read(aiChat)
  const asking = read(aiAsking)
  const draft = read(aiDraft)
  const opened = read(aiOpenTurns)
  const showHistory = read(aiShowHistory)
  const loading = read(aiLoading)
  const first = chat.title ?? chat.turns[0]?.question ?? asking
  const last = chat.turns.length - 1
  return (
    <Box height="100%" gap="sm">
      <Box shrink={false}>
        <Row justify="between" align="center">
          <Row gap="xs" align="center">
            <BackButton onPress={goHome} />
            <Heading level={2}>{showHistory ? 'Chat history' : first ? chatTitle(first) : 'Backlog AI'}</Heading>
          </Row>
          <Row gap="xs">
            <IconButton
              icon={showHistory ? 'close' : 'layers'}
              label={showHistory ? 'Back to the chat' : 'Chat history'}
              size="sm"
              variant="ghost"
              onPress={() => {
                set(aiShowHistory, !showHistory)
                if (!showHistory) void loadAiHistory()
              }}
            />
            <IconButton icon="add" label="New chat" size="sm" variant="ghost" disabled={!!asking} onPress={newAiChat} />
            <IconButton icon="open-external" label="Open in Backlog" size="sm" variant="ghost" onPress={openAiOnWeb} />
          </Row>
        </Row>
      </Box>
      <Box grow minHeight={0} scroll="y" gap="md" paddingX="xs">
        {showHistory ? (
          <AiHistoryList />
        ) : loading ? (
          <Spinner label="Loading the chat" />
        ) : (
          <>
            {chat.turns.length || asking ? (
              <Text muted size="sm">
                {chat.more ? 'Earlier messages are in Backlog: Open in Backlog' : 'Beginning of conversation'}
              </Text>
            ) : (
              <Stack gap="sm">
                <Heading level={3}>How can I help?</Heading>
                <Text muted>Backlog AI reads the issues, wikis and documents of the projects you are in.</Text>
                <Row gap="xs" wrap>
                  {['Summarise my open issues', 'What changed this week?', 'Find issues about '].map((idea) => (
                    <Button key={idea} size="sm" variant="outline" onPress={() => set(aiDraft, idea)}>
                      {idea.trim()}
                    </Button>
                  ))}
                </Row>
              </Stack>
            )}
            {chat.turns.map((turn, index) => (
              <Stack key={index} gap="sm">
                {turn.question ? <QuestionBubble text={turn.question} /> : null}
                {index === last || opened.includes(index) ? (
                  <Answer answer={turn.answer} />
                ) : (
                  <Row>
                    <Button size="xs" variant="ghost" icon="expand" onPress={() => set(aiOpenTurns, [...opened, index])}>
                      Show answer
                    </Button>
                  </Row>
                )}
              </Stack>
            ))}
            {asking ? (
              <Stack gap="sm">
                <QuestionBubble text={asking} />
                <Spinner label="Thinking" />
              </Stack>
            ) : null}
          </>
        )}
      </Box>
      <Box shrink={false} gap="xs">
        <CreditNotice />
        <Notice place="ai" />
        <Box border radius="lg" padding="xs" gap="xs">
          <Textarea
            label="Ask Backlog AI"
            labelHidden
            rows={2}
            placeholder={chat.turns.length ? 'Ask a follow-up' : 'Ask me anything'}
            value={draft}
            onChange={(value) => set(aiDraft, value)}
            onSubmit={() => void askAi()}
          />
          <Row justify="between" align="center">
            <Text muted size="xs">
              AI can make mistakes; double-check outcomes.
            </Text>
            <Button size="sm" tone="accent" icon="next" disabled={!!asking || !!loading || !draft.trim()} onPress={askAi}>
              Send
            </Button>
          </Row>
        </Box>
      </Box>
    </Box>
  )
}

/** A question, on the right in a grey bubble. */
function QuestionBubble({ text }: { text: string }) {
  return (
    <Row justify="end">
      <Box maxWidth="85%" background="muted" radius="lg" paddingX="sm" paddingY="xs">
        <Text>{text}</Text>
      </Box>
    </Row>
  )
}

/** An answer, as text on the left, with what it looked at and a copy button under it. */
function Answer({ answer }: { answer: AiAnswer }) {
  return (
    <Stack gap="xs">
      {answer.text.trim() ? <Markdown content={answer.text} /> : <Text muted>No answer text.</Text>}
      {answer.approval ? (
        <Callout tone="warning">{`It wants to ${toolLabel(answer.approval)}. Approve or decline that in Backlog: Open in Backlog.`}</Callout>
      ) : null}
      <Row gap="xs" align="center">
        <IconButton icon="copy" label="Copy the answer" size="xs" variant="ghost" disabled={!answer.text.trim()} onPress={() => copyAnswer(answer.text)} />
        {answer.tools.length ? (
          <Text muted size="xs">
            {`Looked at: ${answer.tools.map(toolLabel).join(', ')}`}
          </Text>
        ) : null}
      </Row>
    </Stack>
  )
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

const isPicked = (list: string, url: string) => {
  const p = read(pickedLink)
  return p?.list === list && p.url === url
}
/** A second press on ⋯ closes the menu again. */
const pickLink = (list: string, url: string) => set(pickedLink, isPicked(list, url) ? null : { list, url })

/**
 * What a right-click menu would offer. Orca's components have no right-click and no popup, so
 * the ⋯ beside a link opens this menu right under it; a left click on the link still opens it.
 */
function LinkMenu({ list, url }: { list: Place; url: string }) {
  const run = (how: 'copy' | 'browser' | 'orca') => {
    set(pickedLink, null)
    void linkAction(list, url, how)
  }
  return (
    <Box border radius="md" background="card" padding="xs" gap="none" align="start">
      <Button size="sm" variant="ghost" icon="copy" onPress={() => run('copy')}>
        Copy link
      </Button>
      <Button size="sm" variant="ghost" icon="open-external" onPress={() => run('browser')}>
        Open in browser
      </Button>
      <Button size="sm" variant="ghost" icon="globe" onPress={() => run('orca')}>
        Open in Orca
      </Button>
    </Box>
  )
}

/** A link: left click opens it in the browser; ⋯ opens its menu underneath. */
function LinkRow(props: {
  list: 'links' | 'pullRequests' | 'myPullRequests'
  url: string
  title: string
  description: string
  /** A pull request's conflict check: only a conflict shows. */
  check?: ConflictCheck | 'checking'
}) {
  const { list, url, title, description, check } = props
  const open = isPicked(list, url)
  // A ListItem, not a Link: Orca draws a Link as a button that centres its text once a long
  // title wraps. A ListItem keeps it on one line, at the start.
  return (
    <Stack gap="xs">
      <Row gap="xs" align="center">
        <Box grow minWidth={0}>
          <List label={title}>
            <ListItem title={title} description={description} onPress={() => void openInBrowser(list, url)}>
              {check && check !== 'checking' && check.state === 'conflict' ? (
                <Row gap="none">
                  <Badge tone="danger">Conflict</Badge>
                </Row>
              ) : null}
            </ListItem>
          </List>
        </Box>
        <IconButton
          icon={open ? 'close' : 'more'}
          label={`${open ? 'Close the menu of' : 'More for'} ${title}`}
          size="sm"
          variant="ghost"
          onPress={() => pickLink(list, url)}
        />
      </Row>
      {open ? <LinkMenu list={list} url={url} /> : null}
    </Stack>
  )
}

/** A plain press on a link: the browser, with a word only when it fails. */
async function openInBrowser(place: Place, url: string): Promise<void> {
  try {
    await shell.openExternal(url)
  } catch (error) {
    say(place, 'danger', message(error))
  }
}

/** The last result for one place, as a line of text where the action was. */
function Notice({ place }: { place: Place }) {
  const n = read(notice)
  if (n?.place !== place) return null
  return (
    <Text size="sm" {...(n.tone === 'neutral' ? { muted: true } : { tone: n.tone })}>
      {n.text}
    </Text>
  )
}

/** Every web link of the issue, its own page first. */
function Links({ issue }: { issue: IssueDetail }) {
  return (
    <Section title={`Links (${issue.links.length})`} id="links">
      <Stack gap="sm">
        {issue.links.map((l) => (
          <LinkRow
            key={l.url}
            list="links"
            url={l.url}
            title={l.label}
            description={l.from === 'issue' ? l.url : `${l.from} · ${l.url}`}
          />
        ))}
        <Notice place="links" />
      </Stack>
    </Section>
  )
}

function PullRequests({ issue }: { issue: IssueDetail }) {
  const prs = issue.pullRequests
  return (
    <Section title={`Pull requests (${prs.length})`} id="pullRequests">
      {prs.length ? (
        <Stack gap="sm">
          {prs.map((pr) => (
            <LinkRow
              key={pr.key}
              list="pullRequests"
              url={pr.url}
              check={pr.statusId === PR_OPEN ? read(prChecks)[pr.key] : undefined}
              title={`#${pr.number} ${pr.summary}`}
              description={`${pr.status} · ${pr.repo}: ${pr.branch} → ${pr.base}${pr.author ? ` · ${pr.author}` : ''}`}
            />
          ))}
          <Notice place="pullRequests" />
        </Stack>
      ) : (
        <Text muted size="sm">
          No pull request links this issue.
        </Text>
      )}
    </Section>
  )
}

/**
 * Worktrees of this issue on this computer: where agents were started for it, and ones linked by
 * hand. Press one to show it with its terminal; a deleted worktree drops off when the issue loads.
 */
function Worktrees({ issue }: { issue: IssueDetail }) {
  const r = read(issueRuns)
  const runs = r?.key === issue.key ? r.runs : []
  const agents = read(launchOptions)?.agents ?? []
  const linked = new Set(runs.map((run) => `ws:${run.workspaceId}`))
  const choices = (read(launchOptions)?.targets ?? []).filter((t) => t.value.startsWith('ws:') && !linked.has(t.value))
  const pick = choices.some((c) => c.value === read(linkTarget)) ? read(linkTarget) : 'none'
  return (
    <Section title={`Worktrees (${runs.length})`} id="worktrees">
      <Stack gap="sm">
        {runs.map((run) => (
          <Row key={run.workspaceId} gap="xs" align="center">
            <Box grow minWidth={0}>
              <List label={run.label}>
                <ListItem
                  icon="branch"
                  title={run.label}
                  onPress={() => void focusRun(run.workspaceId)}
                  description={[
                    run.agent ? (agents.find((a) => a.value === run.agent)?.label ?? run.agent) : 'linked',
                    run.skill,
                    run.branch,
                    `${run.agent ? 'started' : 'since'} ${new Date(run.startedAt).toLocaleString()}`
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              </List>
            </Box>
            <IconButton
              icon="close"
              label={`Unlink ${run.label}`}
              size="sm"
              variant="ghost"
              onPress={() => void linkRun(issue.key, run.workspaceId, 'unlink')}
            />
          </Row>
        ))}
        {choices.length ? (
          <Row gap="xs" align="end">
            <Box grow minWidth={0}>
              <Select
                label="Link a worktree"
                value={pick}
                options={[{ value: 'none', label: 'Pick an existing worktree' }, ...choices]}
                onChange={(v) => set(linkTarget, v)}
              />
            </Box>
            <Button size="sm" icon="link" disabled={pick === 'none'} onPress={() => void linkRun(issue.key, pick.slice(3), 'link')}>
              Link
            </Button>
          </Row>
        ) : null}
        <Notice place="worktrees" />
      </Stack>
    </Section>
  )
}

function IssueBody({ issue }: { issue: IssueDetail }) {
  return (
    <Stack gap="sm">
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
      <Links issue={issue} />
      <Worktrees issue={issue} />
      <LaunchCard issue={issue} />
      <Section title="Description" id="description">
        <Description issue={issue} />
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
      <Notice place="attachments" />
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
              <RichText content={c.content} issueKey={issue.key} place="comments" />
            </Stack>
          ))}
        </Stack>
      </Section>
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

/** The description as Backlog shows it, or its raw text while the header's edit mode is on. */
function Description({ issue }: { issue: IssueDetail }) {
  const form = read(editing)
  if (read(editingText) && form?.key === issue.key) {
    return (
      <Textarea
        label="Description"
        labelHidden
        rows={12}
        placeholder="Description (Backlog formatting)"
        value={form.fields.description}
        onChange={(description) => set(editing, { ...form, fields: { ...form.fields, description } })}
        onSubmit={() => void saveIssue(issue, 'text')}
      />
    )
  }
  return (
    <Stack gap="xs">
      {issue.description ? <RichText content={issue.description} issueKey={issue.key} place="description" /> : <Text muted>No description.</Text>}
      <Notice place="description" />
    </Stack>
  )
}

/**
 * Pinned under the issue: one bar while closed; opened, it rises over the body (which scrolls)
 * with the comment and every other field. One save sends both, as Backlog records them.
 */
function UpdateSheet({ issue }: { issue: IssueDetail }) {
  const form = read(editing)
  if (!form || form.key !== issue.key) return null
  const open = read(sheetOpen)
  const pending = Object.keys(changesOf(issue.fields, form, 'fields')).length
  return (
    <Box shrink={false} border radius="md" background="card" padding="xs" gap="xs" maxHeight="60%">
      <Row justify="between" align="center">
        <Button variant="ghost" size="sm" icon={open ? 'collapse' : 'expand'} onPress={() => set(sheetOpen, !open)}>
          {open ? 'Hide update' : 'Update issue'}
        </Button>
        {pending ? <Badge tone="accent">{`${pending} pending`}</Badge> : null}
      </Row>
      {open ? (
        <Box grow minHeight={0} scroll="y" paddingX="xs">
          <UpdateFields issue={issue} />
        </Box>
      ) : null}
    </Box>
  )
}

/** Comment on the issue and change its fields. */
function UpdateFields({ issue }: { issue: IssueDetail }) {
  const form = read(editing)
  const m = read(editMeta)
  if (!form || form.key !== issue.key) return null
  const meta = m?.projectId === issue.projectId ? m.meta : null
  const f = form.fields
  const change = (part: Partial<IssueFields>) => set(editing, { ...form, fields: { ...f, ...part } })
  const changes = changesOf(issue.fields, form, 'fields')
  const dirty = Object.keys(changes).length > 0
  const fieldCount = Object.keys(changes).filter((c) => c !== 'comment' && c !== 'files').length
  const busy = read(saving)
  const fetching = read(picking)
  const label = busy
    ? 'Saving…'
    : fieldCount
      ? `Save ${fieldCount} change${fieldCount > 1 ? 's' : ''}${changes.comment || changes.files ? ' and comment' : ''}`
      : 'Comment'
  return (
    <Stack gap="sm">
        <Textarea
          label="Comment"
          rows={4}
          placeholder="Add a comment (Backlog formatting)"
          value={form.comment}
          onChange={(comment) => set(editing, { ...form, comment })}
          onSubmit={() => void saveIssue(issue, 'fields')}
        />
        <Row gap="xs" wrap align="center">
          <Button
            size="sm"
            variant="ghost"
            icon="copy"
            tooltip="Attach the image on the clipboard, such as a screenshot"
            disabled={busy || fetching}
            onPress={() => addFiles(issue, 'paste')}
          >
            Paste image
          </Button>
          <Button size="sm" variant="ghost" icon="upload" disabled={busy || fetching} onPress={() => addFiles(issue, 'choose')}>
            Attach file…
          </Button>
          {fetching ? <Spinner label="Waiting for the files" /> : null}
        </Row>
        {form.files.length ? (
          <Stack gap="xs">
            {form.files.map((f) => (
              <Row key={f.id} gap="xs" align="center">
                <Box grow minWidth={0}>
                  <List label={f.name}>
                    <ListItem icon="file" title={f.name} description={`${size(f.size)}${f.kind === 'image' ? ' · shown in the comment' : ''}`} />
                  </List>
                </Box>
                <IconButton icon="close" label={`Remove ${f.name}`} size="sm" variant="ghost" disabled={busy} onPress={() => removeFile(issue, f.id)} />
              </Row>
            ))}
          </Stack>
        ) : null}
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
          </Stack>
        )}
        <Notice place="fields" />
        <Row gap="xs" wrap>
          <Button tone="accent" icon="check" disabled={busy || !dirty} onPress={() => saveIssue(issue, 'fields')}>
            {label}
          </Button>
          <Button variant="ghost" disabled={busy || !dirty} onPress={() => discardFields(issue)}>
            Discard
          </Button>
        </Row>
    </Stack>
  )
}

/** Drops the sheet's edits and comment; the header's stay. */
function discardFields(issue: IssueDetail): void {
  const form = read(editing)
  if (form?.key !== issue.key) return
  const text = Object.fromEntries(TEXT_FIELDS.map((name) => [name, form.fields[name]]))
  if (form.files.length) void plugin.request('files.drop', { ids: form.files.map((f) => f.id) }).catch(() => undefined)
  set(editing, { key: issue.key, fields: { ...issue.fields, ...text }, comment: '', files: [] })
}

export default function Panel() {
  const s = read(session)
  const key = read(openKey)
  if (s === undefined) return <Spinner label="Connecting to Backlog" />
  if (!s) return <LoginView />
  if (key) return <DetailView issueKey={key} />
  const now = read(screen)
  if (now === 'ai') return <AiView />
  return now === 'settings' ? <SettingsView /> : now === 'home' ? <HomeView me={s} /> : <IssuesView me={s} />
}
