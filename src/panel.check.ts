// `orca plugin check` renders the panel once per scenario; `orca plugin shot --scenario` draws one.
// Mock data only: a fictional "Acme Shop" space. The README screenshots come from these.
import { defineCheck } from 'orca/testing'
import type { AuthState, IssueDetail, IssueRow, Meta } from './protocol'

const hour = 3_600_000
const now = Date.now()

const auth: AuthState = {
  session: { accountId: 'acme.backlog.com.1', space: 'acme.backlog.com', me: { id: 1, name: 'Alex Kim', userId: 'alex' } },
  accounts: [
    { id: 'acme.backlog.com.1', space: 'acme.backlog.com', name: 'Alex Kim' },
    { id: 'side.backlog.jp.7', space: 'side.backlog.jp', name: 'Alex (side project)' }
  ],
  orcaProject: { value: 'p1', label: 'acme-shop' }
}

const option = (value: string, label: string) => ({ value, label })
const meta: Meta = {
  projects: [option('10', 'Acme Shop (SHOP)'), option('11', 'Acme Mobile (MOB)'), option('12', 'Design System (DS)')],
  statuses: [option('1', 'Open'), option('2', 'In Progress'), option('3', 'Resolved'), option('4', 'Closed')],
  priorities: [option('2', 'High'), option('3', 'Normal'), option('4', 'Low')],
  users: [option('1', 'Alex Kim'), option('2', 'Sam Lee'), option('3', 'Mina Park')],
  resolutions: [option('0', 'Fixed'), option('1', "Won't Fix"), option('2', 'Invalid')],
  issueTypes: [option('20', 'Bug'), option('21', 'Task'), option('22', 'Feature')],
  categories: [option('30', 'Checkout'), option('31', 'Search'), option('32', 'Accounts')],
  versions: [option('40', 'Sprint 12'), option('41', 'Sprint 13'), option('42', 'v2.0')]
}

const row = (key: string, summary: string, statusId: number, priority: string, due: string | null, ago: number): IssueRow => ({
  key,
  summary,
  status: meta.statuses.find((s) => s.value === String(statusId))!.label,
  statusId,
  priority,
  type: 'Task',
  due,
  updated: now - ago * hour
})
const rows: IssueRow[] = [
  row('SHOP-142', 'Apple Pay button misaligned on checkout', 2, 'High', '2026-12-02', 1),
  row('SHOP-139', 'Search suggestions ignore accents', 1, 'Normal', '2026-12-05', 5),
  row('SHOP-131', 'Add order history export (CSV)', 1, 'Normal', null, 20),
  row('MOB-88', 'Push notification opens the wrong tab', 2, 'High', '2026-11-28', 26),
  row('SHOP-120', 'Password reset email has broken link', 3, 'Low', null, 50),
  row('DS-17', 'Button focus ring contrast below AA', 1, 'Normal', '2026-12-10', 72)
]

const detail: IssueDetail = {
  ...rows[0]!,
  type: 'Bug',
  url: 'https://acme.backlog.com/view/SHOP-142',
  projectId: 10,
  description: [
    '### Steps to reproduce',
    '1. Open the cart on Safari 18',
    '2. Go to **Checkout**',
    '',
    '### Expected',
    'The Apple Pay button lines up with the card form.',
    '',
    '### Actual',
    'It sits 12px lower and overlaps the total.'
  ].join('\n'),
  assignee: 'Alex Kim',
  createdUser: 'Sam Lee',
  created: now - 30 * hour,
  startDate: '2026-11-24',
  milestones: ['Sprint 13'],
  categories: ['Checkout'],
  attachments: [
    { id: 1, name: 'checkout-safari.png', size: 184_320, kind: 'image' },
    { id: 2, name: 'repro.mp4', size: 2_411_000, kind: 'video' },
    { id: 3, name: 'har-export.har', size: 96_000, kind: 'file' }
  ],
  comments: [
    { id: 1, author: 'Sam Lee', content: 'Also happens on iPad.  \nScreenshot attached.', created: now - 20 * hour },
    { id: 2, author: 'Alex Kim', content: 'Fixed the flex alignment, PR is up for review.', created: now - 2 * hour }
  ],
  parent: { key: 'SHOP-100', summary: 'Checkout polish for v2.0', status: 'In Progress', statusId: 2 },
  children: [],
  related: [{ key: 'MOB-88', summary: 'Push notification opens the wrong tab', status: 'In Progress', statusId: 2 }],
  pullRequests: [
    {
      key: '5-212',
      number: 212,
      summary: 'Fix Apple Pay button alignment on Safari',
      repo: 'shop-web',
      branch: 'fix/SHOP-142',
      base: 'main',
      status: 'Open',
      statusId: 1,
      author: 'Alex Kim',
      updated: now - 2 * hour,
      url: 'https://acme.backlog.com/git/SHOP/shop-web/pullRequests/212'
    }
  ]
}

const requests = {
  'auth.status': () => auth,
  'meta.get': () => meta,
  'issues.list': () => ({ issues: rows, total: rows.length }),
  'issues.count': () => ({ count: 3 }),
  'issue.get': () => detail,
  'launch.options': () => ({
    targets: [option('ws:1', 'acme-shop / main'), option('new:p1|local', '+ New worktree in acme-shop')],
    agents: [option('claude', 'Claude'), option('codex', 'Codex')],
    skills: [{ value: 'code-review', label: 'code-review', providers: ['claude'] }],
    focused: 'ws:1',
    defaultAgent: 'claude'
  }),
  'settings.get': () => ({
    accounts: auth.accounts,
    projects: [
      { value: 'p1', label: 'acme-shop', accountId: 'acme.backlog.com.1' },
      { value: 'p2', label: 'side-hustle', accountId: 'side.backlog.jp.7' },
      { value: 'p3', label: 'dotfiles', accountId: '' }
    ]
  })
}

export default defineCheck({
  signedOut: { requests: { 'auth.status': () => ({ session: null, accounts: [], orcaProject: null }) } },
  home: { requests, persisted: { plugin: { screen: 'home', openKey: null } } },
  issues: {
    requests,
    persisted: { plugin: { screen: 'issues', openKey: null, advancedOpen: true, issueFilters: { projectId: '10', categoryId: '30' } } }
  },
  detail: { requests, persisted: { plugin: { screen: 'home', openKey: 'SHOP-142' } } },
  settings: { requests, persisted: { plugin: { screen: 'settings', openKey: null } } }
})
