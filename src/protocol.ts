// The panel <-> worker contract, declared once: src/panel.tsx and src/worker.ts both read it.

export type Option = { value: string; label: string }

/** An image reference in issue text: `![alt](attachment:<id>)`, drawn as an Open preview button. */
export const ATTACHMENT_SCHEME = 'attachment:'

/** A saved Backlog login: one user in one space. */
export type Account = { id: string; space: string; name: string }

export type Session = {
  accountId: string
  space: string
  me: { id: number; name: string; userId: string }
}

/** The account in use, chosen for the Orca project in focus. */
export type AuthState = {
  session: Session | null
  accounts: Account[]
  /** The focused Orca project: switching account while in it remembers the choice for it. */
  orcaProject: Option | null
  error?: string
}

/** A backlog-mcp-server entry found in a config on this machine. The key stays in the worker. */
export type FoundCredential = {
  id: string
  space: string
  /** The config file, `~` for the home folder. */
  file: string
  /** The key's last characters, to tell entries apart. */
  keyHint: string
  /** Already a saved account. */
  saved: boolean
  /** Why signing in with it failed, when it was tried. */
  error?: string
}

/** A workspace an agent was started in for an issue, remembered on this computer. */
export type IssueRun = {
  workspaceId: string
  /** `project / worktree`, as Orca names it now. */
  label: string
  branch: string | null
  /** `''` for a worktree linked by hand, with no agent started. */
  agent: string
  skill?: string
  startedAt: number
  /** Linked by hand to the issue, not by starting an agent there. */
  linked?: boolean
}

export type AccountSettings = {
  accounts: Account[]
  /** Orca projects, each with the account it uses (`''`: the last used one). */
  projects: (Option & { accountId: string })[]
}

/** Extra CA certificates HTTPS trusts, for company proxies and antivirus that re-sign it. */
export type CertificateSettings = {
  /** Trust the OS certificate store (on by default). */
  system: boolean
  /** A PEM file with more CA certificates; `''` for none. */
  caFile: string
}

export type CertificateStatus = CertificateSettings & {
  /** How many certificates each source adds. */
  node: number
  systemCount: number
  fileCount: number
  error?: string
}

export type Meta = {
  projects: Option[]
  statuses: Option[]
  priorities: Option[]
  /** Members of the project, or of every project; `value` is the user id. */
  users: Option[]
  resolutions: Option[]
  /** Per project: empty until one project is chosen. */
  issueTypes: Option[]
  categories: Option[]
  /** Backlog's versions, which also serve as milestones. */
  versions: Option[]
}

/** Backlog's `parentChild`: 0 all, 1 exclude subtasks, 2 subtasks only, 3 neither, 4 parents only. */
export type Subtasking = '0' | '1' | '2' | '3' | '4'

/** Backlog dashboard due tabs. */
export type DueFilter = 'all' | '4days' | 'today' | 'overdue'

/**
 * Filters shared by the dashboard and the issue list. `status`: a status id, `notClosed`
 * (Backlog's default view) or `all`. `assignee`: `me`, `all` or a user id (default `me`).
 */
export type IssueFilter = {
  projectId?: string
  status: string
  priorityId?: string
  keyword?: string
  assignee?: string
  /** Only issues I created. */
  createdByMe?: boolean
  due?: DueFilter
  /** Advanced search: an id each (`all` or absent: any). */
  issueTypeId?: string
  categoryId?: string
  versionId?: string
  milestoneId?: string
  createdUserId?: string
  resolutionId?: string
  parentChild?: Subtasking
  /** Only issues with attachments / shared files. */
  attachment?: boolean
  sharedFile?: boolean
}

export type IssueQuery = IssueFilter & {
  sort: SortKey
  order: 'asc' | 'desc'
  offset: number
}

/** Backlog's own `sort` values the table can ask for. */
/** Backlog's own `sort` values the tables use. */
export type SortKey =
  | 'updated'
  | 'created'
  | 'summary'
  | 'status'
  | 'priority'
  | 'dueDate'
  | 'issueType'
  | 'assignee'
  | 'createdUser'
  | 'updatedUser'
  | 'startDate'
  | 'category'
  | 'milestone'
  | 'version'
  | 'estimatedHours'
  | 'actualHours'

export type IssueRow = {
  key: string
  summary: string
  status: string
  statusId: number
  priority: string
  type: string
  /** The issue type's colour in Backlog, `#rrggbb`. */
  typeColor: string | null
  due: string | null
  updated: number
  assignee: string | null
  createdUser: string | null
  updatedUser: string | null
  created: number
  startDate: string | null
  /** Names joined with `, `; `''` for none. */
  category: string
  milestone: string
  version: string
  resolution: string
  estimatedHours: number | null
  actualHours: number | null
}

export type AttachmentKind = 'image' | 'video' | 'file'

/** Another issue this one links to. */
export type LinkedIssue = { key: string; summary: string; status: string; statusId: number }

/** A Backlog pull request whose "related issue" is this one. */
export type PullRequest = {
  key: string
  number: number
  summary: string
  repo: string
  branch: string
  base: string
  status: string
  statusId: number
  author: string | null
  updated: number
  url: string
  /** The Backlog project, `Name (KEY)`; set where PRs of several projects are listed. */
  project?: string
}

/** Backlog's pull request statuses. Only open ones are checked for conflicts. */
export const PR_OPEN = 1

/** Whether an open pull request would merge into its base cleanly, as git on this computer sees it. */
export type ConflictCheck =
  | { state: 'clean' }
  | { state: 'conflict'; files: string[] }
  /** No clone of the repository here, git failed, or the PR is not open. */
  | { state: 'unknown'; reason: string }

/** One change the plugin made, to Backlog or on this computer. */
export type AuditEntry = {
  id: string
  at: number
  /** What was done, e.g. "Updated issue". */
  action: string
  /** The API that did it: `PATCH /api/v2/issues/APP-1`, `orca agent launch`, `plugin storage`… */
  api: string
  /** What it was done to: an issue key, a space, a file. */
  target?: string
  details?: string
  /** The Backlog space in use. */
  space?: string
  ok: boolean
  error?: string
}

/** An issue's editable values, as Backlog ids in strings; `''` for none. Dates are `yyyy-MM-dd`. */
export type IssueFields = {
  summary: string
  description: string
  statusId: string
  resolutionId: string
  assigneeId: string
  priorityId: string
  issueTypeId: string
  categoryIds: string[]
  milestoneIds: string[]
  versionIds: string[]
  startDate: string
  dueDate: string
  estimatedHours: string
  actualHours: string
}

/** Only the fields that changed, and an optional comment Backlog records with them. */
export type IssueChanges = Partial<IssueFields> & { comment?: string }

/** A web link of an issue: its own page, a pull request, or one written in its text. */
export type IssueLink = { url: string; label: string; from: 'issue' | 'pull request' | 'description' | 'comment' }

export type IssueDetail = IssueRow & {
  /** The issue's page, its pull requests, then links in its description and comments. */
  links: IssueLink[]
  /** What the edit form starts from. */
  fields: IssueFields
  url: string
  projectId: number
  description: string
  assignee: string | null
  createdUser: string | null
  created: number
  startDate: string | null
  milestones: string[]
  categories: string[]
  attachments: { id: number; name: string; size: number; kind: AttachmentKind }[]
  comments: { id: number; author: string; content: string; created: number }[]
  parent: LinkedIssue | null
  children: LinkedIssue[]
  related: LinkedIssue[]
  pullRequests: PullRequest[]
}

export type SkillOption = Option & { providers: string[] }

export type LaunchOptions = {
  targets: Option[]
  agents: Option[]
  skills: SkillOption[]
  /** Target value of the workspace focused in Orca, when there is one. */
  focused: string | null
  defaultAgent: string | null
}

declare module 'orca' {
  interface PluginRequests {
    /**
     * Signs in with the account of the focused Orca project. With no saved account it imports one
     * from the environment or an MCP config.
     */
    'auth.status': { output: AuthState }
    /** Adds an account and switches to it. */
    'auth.login': { input: { space: string; apiKey: string }; output: AuthState }
    /** Credentials found in MCP configs on this machine and in the focused workspace. */
    'credentials.found': { output: FoundCredential[] }
    /** Signs in with a found credential, saves it as an account and switches to it. */
    'credentials.use': { input: { id: string }; output: AuthState }
    /** Switches account and remembers it for the focused Orca project. */
    'account.use': { input: { id: string }; output: AuthState }
    'account.remove': { input: { id: string }; output: AuthState }
    'settings.get': { output: AccountSettings }
    /** Every change the plugin made, newest first (at most 500). */
    'audit.list': { output: AuditEntry[] }
    /** Empties the audit log, leaving one entry that says so. */
    'audit.clear': { output: AuditEntry[] }
    /** `accountId` empty: the project follows the last used account. */
    'settings.map': { input: { projectId: string; accountId: string }; output: AccountSettings }
    'connection.get': { output: CertificateStatus }
    'connection.set': { input: CertificateSettings; output: CertificateStatus }
    /** Reaches the space of the account in use; `message` is the space name or the failure. */
    'connection.test': { output: { ok: boolean; message: string } }
    /** Projects, and the statuses and priorities to filter by (statuses of one project when given). */
    'meta.get': { input: { projectId?: string }; output: Meta }
    'issues.list': { input: IssueQuery; output: { issues: IssueRow[]; total: number } }
    'issues.count': { input: IssueFilter; output: { count: number } }
    'issue.get': { input: { key: string }; output: IssueDetail }
    /** Saves changed fields (with the comment, if any), or only adds the comment; answers the issue again. */
    'issue.update': { input: { key: string; changes: IssueChanges }; output: IssueDetail }
    /** Open pull requests I created, in every project's repositories, newest first. */
    'pullRequests.mine': { output: PullRequest[] }
    /**
     * Merges each open PR (by `PullRequest.key`, from an earlier list) into its base in a clone of
     * its repository among the Orca workspaces on this computer; only the two branches are fetched.
     */
    'pullRequests.conflicts': { input: { keys: string[] }; output: Record<string, ConflictCheck> }
    /** Copies a link to the system clipboard. */
    'link.copy': { input: { url: string }; output: { copied: true } }
    /** Opens a link in a tab of Orca's own browser, in the focused workspace. */
    'link.openInOrca': { input: { url: string }; output: { opened: true } }
    /** Images and videos open in Orca's preview; other files land in Downloads and their folder opens. */
    'attachment.open': {
      input: { key: string; attachmentId: number }
      output: { path: string; mode: 'preview' | 'folder' | 'external' }
    }
    'launch.options': { output: LaunchOptions }
    /** Workspaces agents were started in for an issue, newest first; gone ones are dropped. */
    'runs.get': { input: { key: string }; output: IssueRun[] }
    /** Links an existing workspace to the issue, so its detail lists it. */
    'runs.link': { input: { key: string; workspaceId: string }; output: IssueRun[] }
    /** Forgets a workspace for the issue; the workspace itself stays. */
    'runs.unlink': { input: { key: string; workspaceId: string }; output: IssueRun[] }
    /** Shows a workspace in Orca and focuses its terminal, opening one when it has none. */
    'runs.focus': { input: { workspaceId: string }; output: { opened: boolean } }
    /** The first message for an agent: `/skill KEY` with a skill, else a brief of the issue. */
    'launch.prompt': { input: { key: string; agent: string; skill?: string }; output: { prompt: string } }
    /** `prompt` as given (edited in the panel), else the one `launch.prompt` answers. */
    'launch.start': {
      input: { key: string; target: string; agent: string; skill?: string; prompt?: string }
      output: { workspaceId: string }
    }
  }
  interface PluginPanelEvents {
    /** Posted to every open panel after the account changes, so a second panel stays in step. */
    'auth.changed': AuthState
  }
}
