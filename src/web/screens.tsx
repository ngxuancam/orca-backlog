// The top bar, Home (projects, my pull requests, My Issues) and a project's issue list.
import { h } from './vendor/preact.js'
import type { ComponentChildren } from './vendor/preact.js'
import type { ConflictCheck, Option, PullRequest, Session, Subtasking } from '../protocol.js'
import { advancedCount, ADVANCED, DUE_TABS, SUBTASKING, type App, type Place } from './app.js'
import { Icon } from './icons.js'
import { IssueTable } from './table.js'
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Checkbox,
  Empty,
  IconButton,
  Input,
  MoreButton,
  Notice,
  openMenu,
  Section,
  Segmented,
  Select,
  Spinner,
  useApp,
  type MenuItem
} from './ui.js'

/** Orca's native select refuses nothing here, but long lists stay usable with a cap. */
const MAX_OPTIONS = 500
export const withAll = (label: string, options: readonly Option[]): Option[] => [{ value: 'all', label }, ...options.slice(0, MAX_OPTIONS)]

// --- Top bar -------------------------------------------------------------------------------------

export function TopBar({ title, back, children }: { title: string; back?: () => void; children?: ComponentChildren }) {
  const [s, app] = useApp()
  return (
    <header class="topbar">
      <div class="topbar-row">
        {back ? <IconButton icon="back" label="Back" onClick={back} /> : <span class="brand-mark" aria-hidden="true" />}
        <h1 class="topbar-title" title={title}>
          {title}
        </h1>
        <div class="topbar-actions">
          {children}
          {s.aiStatus === 'available' && s.screen !== 'ai' ? <IconButton icon="bot" label="Ask Backlog AI" onClick={() => app.openAi()} /> : null}
          <IconButton icon="refresh" label="Refresh" onClick={() => app.refresh()} />
          {s.screen !== 'settings' ? <IconButton icon="settings" label="Settings" onClick={() => app.openSettings()} /> : null}
        </div>
      </div>
    </header>
  )
}

/** The account in use; a change is remembered for the Orca project in focus. */
export function AccountPicker({ me }: { me: Session }) {
  const [s, app] = useApp()
  // Always one button, with one account too: its menu switches, adds and manages accounts.
  const items = (): MenuItem[] => [
    ...s.accounts.map(
      (a): MenuItem => ({
        label: `${a.name} · ${a.space}`,
        icon: a.id === me.accountId ? 'check' : 'user',
        disabled: a.id === me.accountId,
        onSelect: () => void app.useAccount(a.id)
      })
    ),
    'separator',
    { label: 'Add account…', icon: 'plus', onSelect: () => app.openSettings('settings.add') },
    { label: 'Manage accounts', icon: 'settings', onSelect: () => app.openSettings('settings.accounts') }
  ]
  return (
    <div class="account-line">
      <button
        type="button"
        class="account-btn"
        aria-haspopup="menu"
        title={s.orcaProject ? `Switching here also remembers the account for Orca project ${s.orcaProject.label}` : 'Switch account'}
        onClick={(e) => openMenu(e as unknown as MouseEvent, items())}
      >
        <Avatar userId={me.me.id} name={me.me.name} size={20} />
        <span class="account-name">
          {me.me.name} · {me.space}
        </span>
        {s.accounts.length > 1 ? <span class="count">{s.accounts.length}</span> : null}
        <Icon name="down" size={14} />
      </button>
      {s.orcaProject ? <span class="muted small account-project">for {s.orcaProject.label}</span> : null}
    </div>
  )
}

// --- Pull requests -------------------------------------------------------------------------------

export function linkMenu(app: App, place: Place, url: string, extra: MenuItem[] = []): MenuItem[] {
  return [
    { label: 'Open in browser', icon: 'external', onSelect: () => void app.linkAction(place, url, 'browser') },
    { label: "Open in Orca's browser", icon: 'globe', onSelect: () => void app.linkAction(place, url, 'orca') },
    { label: 'Copy link', icon: 'copy', onSelect: () => void app.linkAction(place, url, 'copy') },
    ...(extra.length ? (['separator', ...extra] as MenuItem[]) : [])
  ]
}

/** One pull request: a click opens it; right-click or ⋯ for more; a red Conflict when git finds one. */
export function PrRow({ pr, place, check, showProject }: { pr: PullRequest; place: Place; check?: ConflictCheck | 'checking'; showProject?: boolean }) {
  const [, app] = useApp()
  const items = () =>
    linkMenu(app, place, pr.url, [
      ...(pr.projectId ? [{ label: 'Assign to…', icon: 'user' as const, onSelect: () => void app.assignPullRequest(pr, place) }] : []),
      { label: `Copy branch ${pr.branch}`, icon: 'branch', onSelect: () => void app.copyText(place, pr.branch, `Copied ${pr.branch}`) }
    ])
  const conflict = check && check !== 'checking' && check.state === 'conflict' ? check : null
  return (
    <div class="link-row" onContextMenu={(e) => openMenu(e as unknown as MouseEvent, items())}>
      <button type="button" class="link-main" onClick={() => void app.openLink(place, pr.url)} title={pr.url}>
        <Icon name="pr" />
        <span class="link-text">
          <span class="link-title">
            #{pr.number} {pr.summary}
          </span>
          <span class="link-sub">
            {showProject && pr.project ? `${pr.project} · ` : ''}
            {pr.repo}: {pr.branch} → {pr.base}
            {!showProject ? ` · ${pr.status}` : ''}
            {pr.author && !showProject ? ` · ${pr.author}` : ''}
            {pr.assignee ? ` · → ${pr.assignee}` : ''}
          </span>
        </span>
        {conflict ? (
          <span title={conflict.files.length ? `Conflicts in ${conflict.files.join(', ')}` : undefined}>
            <Badge tone="danger">Conflict</Badge>
          </span>
        ) : null}
      </button>
      <MoreButton label={`More for #${pr.number}`} items={items} />
    </div>
  )
}

function MyPullRequests() {
  const [s] = useApp()
  const { prs, loading, error } = s.myPrs
  const conflicts = (prs ?? []).filter((pr) => (s.prChecks[pr.key] as ConflictCheck | undefined)?.state === 'conflict').length
  return (
    <Section id="myPullRequests" title="My pull requests" count={prs?.length}>
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {conflicts ? <div class="notice tone-danger">{conflicts === 1 ? '1 pull request has conflicts.' : `${conflicts} pull requests have conflicts.`}</div> : null}
      {!prs ? (
        loading ? (
          <Spinner label="Loading pull requests" />
        ) : null
      ) : prs.length ? (
        <div class="link-list">
          {prs.map((pr) => (
            <PrRow key={pr.key} pr={pr} place="myPullRequests" check={s.prChecks[pr.key]} showProject />
          ))}
        </div>
      ) : (
        <Empty icon="pr">No open pull request of yours.</Empty>
      )}
      <Notice place="myPullRequests" />
    </Section>
  )
}

// --- Home ----------------------------------------------------------------------------------------

function AiSignInHint() {
  const [s, app] = useApp()
  if (s.aiStatus !== 'signedOut') return null
  return (
    <div class="hint-row">
      <span class="muted">Sign in to Backlog in Orca's browser to see whether Backlog AI is available.</span>
      <Button size="sm" variant="ghost" icon="external" onClick={() => void app.openAiOnWeb()}>
        Sign in
      </Button>
      <Button size="sm" variant="ghost" icon="refresh" onClick={() => void app.loadAiStatus(true)}>
        Check again
      </Button>
    </div>
  )
}

export function HomeView({ me }: { me: Session }) {
  const [s, app] = useApp()
  const projects = s.meta?.projects
  const d = s.dashboard
  return (
    <div class="screen">
      <TopBar title="Dashboard" />
      <div class="screen-body">
        <AccountPicker me={me} />
        <AiSignInHint />
        <Section id="projects" title="Projects" count={projects?.length}>
          {!projects ? (
            <Spinner label="Loading projects" />
          ) : !projects.length ? (
            <Empty icon="folder">No projects: this account is not in any Backlog project.</Empty>
          ) : (
            <div class="project-grid">
              {projects.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  class="project-card"
                  onClick={() => app.openProject(p.value)}
                  onContextMenu={(e) =>
                    openMenu(e as unknown as MouseEvent, [{ label: 'Open issues', icon: 'list', onSelect: () => app.openProject(p.value) }])
                  }
                >
                  <span class="project-icon">{p.label.replace(/\s*\(.*$/, '').slice(0, 1).toUpperCase()}</span>
                  <span class="project-name">{p.label}</span>
                </button>
              ))}
            </div>
          )}
        </Section>
        <MyPullRequests />
        <Section id="myIssues" title="My Issues">
          <Segmented
            options={[
              { value: 'assigned', label: 'Assigned to me' },
              { value: 'created', label: 'Created by me' }
            ]}
            value={d.who}
            counts={s.dashCounts}
            onChange={(who) => app.setDashboard({ who })}
          />
          <Segmented options={DUE_TABS} value={d.due} counts={s.dashCounts} onChange={(due) => app.setDashboard({ due })} />
          <IssueTable
            table="home"
            label="My issues"
            list={s.dashList}
            defaults={['type', 'key', 'summary', 'priority', 'status', 'due']}
            sort={d.sort}
            onSort={(sort) => app.setDashboard({ sort })}
            onLoadMore={() => app.loadDashboard(true)}
          />
        </Section>
        <Notice place="issues" />
      </div>
    </div>
  )
}

// --- Issues --------------------------------------------------------------------------------------

function AdvancedFilters() {
  const [s, app] = useApp()
  const f = s.filters
  const m = s.meta
  const count = advancedCount(f)
  const select = (key: 'issueTypeId' | 'categoryId' | 'versionId' | 'milestoneId' | 'createdUserId' | 'resolutionId', label: string, options: readonly Option[]) => (
    <Select label={label} value={f[key]} disabled={!options.length} options={withAll(`Any ${label.toLowerCase()}`, options)} onChange={(value) => app.setFilter({ [key]: value })} />
  )
  return (
    <div class="advanced">
      <div class="row">
        <Button size="sm" variant="ghost" icon="filter" active={s.advancedOpen} onClick={() => app.set({ advancedOpen: !s.advancedOpen })}>
          {`${s.advancedOpen ? 'Hide' : 'Advanced'} filters${count ? ` (${count})` : ''}`}
        </Button>
        {count ? (
          <Button size="sm" variant="ghost" onClick={() => app.setFilter({ ...ADVANCED })}>
            Clear
          </Button>
        ) : null}
      </div>
      {s.advancedOpen ? (
        <div class="filter-box">
          {f.projectId === 'all' ? <div class="muted small">Choose a project for Issue type, Category, Version and Milestone.</div> : null}
          <div class="filter-grid">
            {select('issueTypeId', 'Issue type', m?.issueTypes ?? [])}
            {select('categoryId', 'Category', m?.categories ?? [])}
            {select('versionId', 'Version', m?.versions ?? [])}
            {select('milestoneId', 'Milestone', m?.versions ?? [])}
            {select('createdUserId', 'Registered by', m?.users ?? [])}
            {select('resolutionId', 'Resolution', m?.resolutions ?? [])}
            <Select label="Subtasking" value={f.parentChild} options={SUBTASKING} onChange={(parentChild) => app.setFilter({ parentChild: parentChild as Subtasking })} />
          </div>
          <div class="row">
            <Checkbox label="Attached" checked={f.attachment} onChange={(attachment) => app.setFilter({ attachment })} />
            <Checkbox label="Shared" checked={f.sharedFile} onChange={(sharedFile) => app.setFilter({ sharedFile })} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function IssuesView({ me }: { me: Session }) {
  const [s, app] = useApp()
  const f = s.filters
  const m = s.meta
  const project = m?.projects.find((p) => p.value === f.projectId)?.label ?? 'All projects'
  return (
    <div class="screen">
      <TopBar title={project} back={() => app.goHome()} />
      <div class="screen-body">
        <div class="search-row">
          <Icon name="search" />
          <input
            class="search-input"
            type="search"
            aria-label="Search issues"
            placeholder="Search key, subject, description"
            value={f.keyword}
            onInput={(e) => app.typeKeyword((e.currentTarget as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && void app.loadIssues()}
          />
          <span class="count" title="Issues">
            {s.issueList.total}
          </span>
        </div>
        <div class="filter-grid">
          <Select label="Project" value={f.projectId} options={withAll('All projects', m?.projects ?? [])} onChange={(projectId) => app.setFilter({ projectId })} />
          <Select
            label="Assignee"
            value={f.assignee}
            options={[
              { value: 'me', label: 'Assigned to me' },
              { value: 'all', label: 'Any assignee' },
              ...(m?.users ?? []).filter((u) => u.value !== String(me.me.id)).slice(0, MAX_OPTIONS)
            ]}
            onChange={(assignee) => app.setFilter({ assignee })}
          />
          <Select
            label="Status"
            value={f.status}
            options={[{ value: 'notClosed', label: 'Not closed' }, { value: 'all', label: 'All statuses' }, ...(m?.statuses ?? [])]}
            onChange={(status) => app.setFilter({ status })}
          />
          <Select label="Priority" value={f.priorityId} options={withAll('All priorities', m?.priorities ?? [])} onChange={(priorityId) => app.setFilter({ priorityId })} />
        </div>
        <AdvancedFilters />
        <IssueTable
          table="issues"
          label="Issues"
          list={s.issueList}
          defaults={['type', 'key', 'summary', 'assignee', 'status', 'priority', 'due', 'updated']}
          sort={f.sort}
          onSort={(sort) => app.setFilter({ sort })}
          onLoadMore={() => void app.loadIssues(true)}
        />
        <Notice place="issues" />
      </div>
    </div>
  )
}
