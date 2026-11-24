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

export type AccountSettings = {
  accounts: Account[]
  /** Orca projects, each with the account it uses (`''`: the last used one). */
  projects: (Option & { accountId: string })[]
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
export type SortKey = 'updated' | 'created' | 'summary' | 'status' | 'priority' | 'dueDate'

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
}

export type IssueDetail = IssueRow & {
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
    /** Switches account and remembers it for the focused Orca project. */
    'account.use': { input: { id: string }; output: AuthState }
    'account.remove': { input: { id: string }; output: AuthState }
    'settings.get': { output: AccountSettings }
    /** `accountId` empty: the project follows the last used account. */
    'settings.map': { input: { projectId: string; accountId: string }; output: AccountSettings }
    /** Projects, and the statuses and priorities to filter by (statuses of one project when given). */
    'meta.get': { input: { projectId?: string }; output: Meta }
    'issues.list': { input: IssueQuery; output: { issues: IssueRow[]; total: number } }
    'issues.count': { input: IssueFilter; output: { count: number } }
    'issue.get': { input: { key: string }; output: IssueDetail }
    /** Images and videos open in Orca's preview; other files land in Downloads and their folder opens. */
    'attachment.open': {
      input: { key: string; attachmentId: number }
      output: { path: string; mode: 'preview' | 'folder' | 'external' }
    }
    'launch.options': { output: LaunchOptions }
    'launch.start': {
      input: { key: string; target: string; agent: string; skill?: string }
      output: { workspaceId: string }
    }
  }
  interface PluginPanelEvents {
    /** Posted to every open panel after the account changes, so a second panel stays in step. */
    'auth.changed': AuthState
  }
}
