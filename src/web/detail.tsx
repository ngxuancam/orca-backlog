// One issue, laid out like Backlog's issue page: the header with type, key and status, the
// properties, description, attachments, links, pull requests, worktrees, the agent hand-off and
// comments; "Comment / Update" opens a sheet from the bottom. Right-click anything for its actions.
import { Fragment, h } from './vendor/preact.js'
import { useState } from './vendor/hooks.js'
import type { IssueDetail, LinkedIssue, Option } from '../protocol.js'
import { ago, changesOf, size, type App, type Place } from './app.js'
import { Icon, type IconName } from './icons.js'
import { Markdown } from './markdown.js'
import { linkMenu, PrRow, TopBar } from './screens.js'
import { issueMenu, issueUrl } from './table.js'
import {
  Button,
  Avatar,
  Callout,
  cx,
  Empty,
  IconButton,
  Input,
  MoreButton,
  Notice,
  openMenu,
  Pill,
  Priority,
  Section,
  Select,
  Sheet,
  Spinner,
  statusColor,
  Textarea,
  useApp,
  type MenuItem
} from './ui.js'

const NO_SKILL = 'none'
const DATE = /^\d{4}-\d{2}-\d{2}$/
const badDate = (d: string) => Boolean(d) && !DATE.test(d)
const badHours = (h: string) => Boolean(h.trim()) && !(Number(h) >= 0)

/** A file the browser handed over (paste or drop), as base64 for the worker. */
async function readFile(file: File): Promise<{ name: string; data: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  // A pasted screenshot is named "image.png": give it a name that says when.
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  const name = !file.name || /^image\.(png|jpe?g|gif)$/i.test(file.name) ? `paste-${stamp}.${file.type.split('/')[1] || 'png'}` : file.name
  return { name, data: btoa(binary) }
}

export function DetailView({ issueKey }: { issueKey: string }) {
  const [s, app] = useApp()
  const { issue, error } = s.detail
  const space = s.session?.space ?? ''
  const headerMenu = (): MenuItem[] => [
    ...issueMenu(app, issueKey, issue?.summary, issue ?? undefined).filter((i) => i === 'separator' || i.label !== 'Open'),
    'separator',
    { label: 'Reload', icon: 'refresh', onSelect: () => void app.openIssue(issueKey) }
  ]
  return (
    <div class="screen">
      <TopBar title={issueKey} back={() => app.backFromIssue()}>
        <IconButton icon="external" label="Open in Backlog" onClick={() => void app.openLink('header', issueUrl(space, issueKey))} />
      </TopBar>
      <div class="screen-body detail-body">
        {error ? <Callout tone="danger" title="Cannot load issue">{error}</Callout> : null}
        {!issue && !error ? <Spinner label="Loading issue" /> : null}
        {issue ? <IssueBody issue={issue} menu={headerMenu} /> : null}
      </div>
      {issue ? <UpdateBar issue={issue} /> : null}
    </div>
  )
}

const today = () => new Date().toISOString().slice(0, 10)
const longDate = (time: number) => new Date(time).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Backlog's issue header: type, key (copy), dates and status; the title with Summarize, Edit and ⋯. */
function IssueHeader({ issue, menu }: { issue: IssueDetail; menu: () => MenuItem[] }) {
  const [s, app] = useApp()
  const overdue = Boolean(issue.due && issue.due < today() && issue.statusId !== 4)
  return (
    <div class="issue-head" onContextMenu={(e) => openMenu(e as unknown as MouseEvent, menu())}>
      <div class="issue-head-line">
        <Pill kind="type" color={issue.typeColor}>{issue.type}</Pill>
        <span class="issue-key-plain">{issue.key}</span>
        <IconButton icon="copy" label={`Copy ${issue.key}`} class="tiny" onClick={() => void app.copyText('header', issue.key, `Copied ${issue.key}`)} />
        <span class="spacer" />
        <span class="head-dates">
          {issue.startDate ? (
            <span class="head-date">
              <span class="head-date-label">Start Date</span> {issue.startDate}
            </span>
          ) : null}
          {issue.due ? (
            <span class={cx('head-date', overdue && 'is-overdue')}>
              <span class="head-date-label">Due Date</span> {issue.due}
              {overdue ? ' 🔥' : ''}
            </span>
          ) : null}
        </span>
        <Pill color={statusColor(issue.statusId, issue.statusColor)}>{issue.status}</Pill>
      </div>
      <h2 class="issue-title">{issue.summary}</h2>
      <div class="issue-actions">
        {s.aiStatus === 'available' ? (
          <Button size="sm" icon="bot" class="btn-ai" onClick={() => app.askAiAbout(`Summarize the issue ${issue.key}: its status, what was decided in the comments, and what is left to do.`)}>
            Summarize
          </Button>
        ) : null}
        <Button size="sm" icon="edit" onClick={() => app.set({ editingText: true })}>
          Edit
        </Button>
        <MoreButton label={`More for ${issue.key}`} items={menu} />
      </div>
      <Notice place="header" />
    </div>
  )
}

/** Subject and description, edited in place of the card's text. */
function EditText({ issue }: { issue: IssueDetail }) {
  const [s, app] = useApp()
  const form = s.editing!
  const changes = changesOf(issue.fields, form, 'text')
  return (
    <div class="edit-text">
      <Input label="Subject" value={form.fields.summary} invalid={!form.fields.summary.trim()} onInput={(summary) => app.editFields({ summary })} onEnter={() => void app.saveIssue(issue, 'text')} autoFocus />
      <Textarea label="Description" rows={8} maxRows={30} value={form.fields.description} onInput={(description) => app.editFields({ description })} onSubmit={() => void app.saveIssue(issue, 'text')} />
      <div class="row">
        <Button variant="primary" icon="check" disabled={s.saving || !Object.keys(changes).length || !form.fields.summary.trim()} onClick={() => void app.saveIssue(issue, 'text')}>
          {s.saving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" disabled={s.saving} onClick={() => app.cancelText(issue)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/** The assignee, pressed to assign someone else (and, if it wants, the issue's pull requests). */
function AssigneeButton({ issue }: { issue: IssueDetail }) {
  const [, app] = useApp()
  return (
    <button type="button" class="person person-btn" title="Assign to…" onClick={() => void app.assignIssue(issue, 'header')}>
      {issue.assignee ? <Avatar userId={issue.assigneeId} name={issue.assignee} size={22} /> : <Icon name="user" size={14} />}
      <span>{issue.assignee ?? 'Unassigned'}</span>
    </button>
  )
}

/** The card: who created it and when, the description, then the properties in two columns. */
function IssueCard({ issue }: { issue: IssueDetail }) {
  const [s, app] = useApp()
  const editing = s.editingText && s.editing?.key === issue.key
  const propsOpen = !s.closedSections.includes('properties')
  return (
    <div class="issue-card">
      <div class="author-row">
        <Avatar userId={issue.createdUserId} name={issue.createdUser} size={34} />
        <div>
          <div class="comment-author">{issue.createdUser ?? 'Someone'}</div>
          <div class="muted small">Created {longDate(issue.created)}</div>
        </div>
      </div>
      {editing ? (
        <EditText issue={issue} />
      ) : issue.description.trim() ? (
        <Markdown text={issue.description} issueKey={issue.key} place="description" class="issue-description" />
      ) : (
        <Empty icon="file">No description.</Empty>
      )}
      <Notice place="description" />
      {propsOpen ? <Properties issue={issue} /> : null}
      <button type="button" class="props-toggle" aria-label={propsOpen ? 'Hide properties' : 'Show properties'} title={propsOpen ? 'Hide properties' : 'Show properties'} onClick={() => app.toggleSection('properties')}>
        <Icon name={propsOpen ? 'up' : 'down'} size={14} />
      </button>
    </div>
  )
}

function Properties({ issue }: { issue: IssueDetail }) {
  const rows: [string, preact.ComponentChildren][] = [
    ['Priority', issue.priority ? <Priority name={issue.priority} /> : null],
    [
      'Assignee',
      issue.assignee ? (
        <AssigneeButton issue={issue} />
      ) : (
        <AssigneeButton issue={issue} />
      )
    ],
    ['Category', issue.categories.length ? <span class="prop-link">{issue.categories.join(', ')}</span> : null],
    ['Milestone', issue.milestones.length ? <span class="prop-link">{issue.milestones.join(', ')}</span> : null],
    ['Version', issue.version ? <span class="prop-link">{issue.version}</span> : null],
    ['Start Date', issue.startDate],
    ['Estimated Hours', issue.estimatedHours],
    ['Actual Hours', issue.actualHours],
    ['Resolution', issue.resolution],
    ['Registered by', issue.createdUser]
  ]
  return (
    <dl class="props">
      {rows.map(([label, value]) => (
        <div key={label} class="prop">
          <dt>{label}</dt>
          <dd>{value === null || value === undefined || value === '' ? '' : value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Linked({ issue }: { issue: IssueDetail }) {
  const [, app] = useApp()
  const items: (LinkedIssue & { role: string })[] = [
    ...(issue.parent ? [{ role: 'Parent', ...issue.parent }] : []),
    ...issue.children.map((c) => ({ role: 'Child', ...c })),
    ...issue.related.map((r) => ({ role: 'Related', ...r }))
  ]
  if (!items.length) return <Empty icon="list">No parent issue, subtask or related issue.</Empty>
  return (
    <div class="tab-body">
      <div class="link-list">
        {items.map((l) => {
          const menu = () => [{ label: 'Open here', icon: 'next' as const, onSelect: () => app.followIssue(l.key) }, ...issueMenu(app, l.key, l.summary).slice(1)]
          return (
            <div key={`${l.role}-${l.key}`} class="link-row" onContextMenu={(e) => openMenu(e as unknown as MouseEvent, menu())}>
              <button type="button" class="link-main" onClick={() => app.followIssue(l.key)}>
                <span class="role">{l.role}</span>
                <span class="link-text">
                  <span class="link-title">
                    <span class="issue-key">{l.key}</span> {l.summary}
                  </span>
                </span>
                <Pill color={statusColor(l.statusId)}>{l.status}</Pill>
              </button>
              <MoreButton label={`More for ${l.key}`} items={menu} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Links({ issue }: { issue: IssueDetail }) {
  const [, app] = useApp()
  return (
    <div class="tab-body">
      {issue.links.length ? null : <Empty icon="link">No links.</Empty>}
      <div class="link-list">
        {issue.links.map((l) => (
          <div key={l.url} class="link-row" onContextMenu={(e) => openMenu(e as unknown as MouseEvent, linkMenu(app, 'links', l.url))}>
            <button type="button" class="link-main" title={l.url} onClick={() => void app.openLink('links', l.url)}>
              <Icon name={l.from === 'pull request' ? 'pr' : 'link'} />
              <span class="link-text">
                <span class="link-title">{l.label}</span>
                <span class="link-sub">{l.from === 'issue' ? l.url : `${l.from} · ${l.url}`}</span>
              </span>
            </button>
            <MoreButton label={`More for ${l.label}`} items={() => linkMenu(app, 'links', l.url)} />
          </div>
        ))}
      </div>
      <Notice place="links" />
    </div>
  )
}

function PullRequests({ issue }: { issue: IssueDetail }) {
  const [s] = useApp()
  const prs = issue.pullRequests
  return (
    <div class="tab-body">
      {prs.length ? (
        <div class="link-list">
          {prs.map((pr) => (
            <PrRow key={pr.key} pr={pr} place="pullRequests" check={pr.statusId === 1 ? s.prChecks[pr.key] : undefined} />
          ))}
        </div>
      ) : (
        <Empty icon="pr">No pull request links this issue.</Empty>
      )}
      <Notice place="pullRequests" />
    </div>
  )
}

function Worktrees({ issue }: { issue: IssueDetail }) {
  const [s, app] = useApp()
  const [pick, setPick] = useState('none')
  const runs = s.issueRuns?.key === issue.key ? s.issueRuns.runs : []
  const agents = s.launchOptions?.agents ?? []
  const linked = new Set(runs.map((r) => `ws:${r.workspaceId}`))
  const choices = (s.launchOptions?.targets ?? []).filter((t) => t.value.startsWith('ws:') && !linked.has(t.value))
  const value = choices.some((c) => c.value === pick) ? pick : 'none'
  return (
    <div class="tab-body">
      {runs.length ? null : <Empty icon="branch">No worktree for this issue yet: start an agent, or link one below.</Empty>}
      <div class="link-list">
        {runs.map((run) => {
          const menu = (): MenuItem[] => [
            { label: 'Show with its terminal', icon: 'agent', onSelect: () => void app.focusRun(run.workspaceId) },
            ...(run.branch ? [{ label: `Copy branch ${run.branch}`, icon: 'branch' as const, onSelect: () => void app.copyText('worktrees', run.branch!, `Copied ${run.branch}`) }] : []),
            'separator',
            { label: 'Unlink from this issue', icon: 'close', danger: true, onSelect: () => void app.linkRun(issue.key, run.workspaceId, 'unlink') }
          ]
          return (
            <div key={run.workspaceId} class="link-row" onContextMenu={(e) => openMenu(e as unknown as MouseEvent, menu())}>
              <button type="button" class="link-main" onClick={() => void app.focusRun(run.workspaceId)}>
                <Icon name="branch" />
                <span class="link-text">
                  <span class="link-title">{run.label}</span>
                  <span class="link-sub">
                    {[run.agent ? (agents.find((a) => a.value === run.agent)?.label ?? run.agent) : 'linked', run.skill, run.branch, `${run.agent ? 'started' : 'since'} ${ago(run.startedAt)}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </button>
              <MoreButton label={`More for ${run.label}`} items={menu} />
            </div>
          )
        })}
      </div>
      {choices.length ? (
        <div class="row align-end">
          <div class="grow">
            <Select label="Link a worktree" value={value} options={[{ value: 'none', label: 'Pick an existing worktree' }, ...choices]} onChange={setPick} />
          </div>
          <Button icon="link" disabled={value === 'none'} onClick={() => void app.linkRun(issue.key, value.slice(3), 'link').then(() => setPick('none'))}>
            Link
          </Button>
        </div>
      ) : null}
      <Notice place="worktrees" />
    </div>
  )
}

function LaunchCard({ issue }: { issue: IssueDetail }) {
  const [s, app] = useApp()
  const options = s.launchOptions
  const c = s.choice
  const draft = s.promptDraft
  return (
    <Section id="launch" title="Assign to an agent">
      {!options ? (
        <Spinner label="Loading agents and skills" />
      ) : !options.agents.length || !options.targets.length ? (
        <Empty icon="agent">{!options.agents.length ? 'No agent is installed in Orca.' : 'No workspace to start an agent in.'}</Empty>
      ) : (
        <div class="stack">
          <div class="filter-grid">
            <Select label="Workspace" value={c.target} options={options.targets} onChange={(target) => app.choose(issue.key, { target })} />
            <Select label="Agent" value={c.agent} options={options.agents} onChange={(agent) => app.choose(issue.key, { agent })} />
            <Select
              label="Skill"
              value={c.skill || NO_SKILL}
              options={[{ value: NO_SKILL, label: 'No skill' }, ...options.skills.filter((k) => !k.providers.length || k.providers.includes(c.agent))]}
              onChange={(skill) => app.choose(issue.key, { skill: skill === NO_SKILL ? '' : skill })}
            />
          </div>
          <Textarea
            label={c.skill ? 'Sent to the agent' : 'Prompt'}
            rows={c.skill ? 2 : 6}
            maxRows={16}
            placeholder={draft && !draft.text && !draft.edited ? 'Writing the prompt…' : 'What the agent should do'}
            value={draft?.text ?? ''}
            onInput={(text) => app.set({ promptDraft: { basis: draft?.basis ?? issue.key, text, edited: true } })}
            onSubmit={() => void app.startAgent(issue.key)}
          />
          <div class="row">
            <Button variant="primary" icon="agent" disabled={!c.target || !c.agent || s.launching} onClick={() => void app.startAgent(issue.key)}>
              {s.launching ? 'Starting…' : 'Start agent'}
            </Button>
            {draft?.edited ? (
              <Button variant="ghost" icon="refresh" onClick={() => void app.refreshPrompt(issue.key, true)}>
                Reset prompt
              </Button>
            ) : null}
          </div>
          <Notice place="launch" />
        </div>
      )}
    </Section>
  )
}

const ATTACHMENT_ICON: Record<string, IconName> = { image: 'image', video: 'video', file: 'file' }

function Attachments({ issue }: { issue: IssueDetail }) {
  const [, app] = useApp()
  if (!issue.attachments.length) return <Empty icon="clip">No attachments.</Empty>
  return (
    <div class="tab-body">
      <div class="link-list">
        {issue.attachments.map((a) => {
          const open = () => void app.openAttachment(issue.key, a.id)
          const what = a.kind === 'file' ? 'Download and open its folder' : 'Preview in Orca'
          return (
            <div key={a.id} class="link-row" onContextMenu={(e) => openMenu(e as unknown as MouseEvent, [{ label: what, icon: a.kind === 'file' ? 'folder' : 'image', onSelect: open }])}>
              <button type="button" class="link-main" onClick={open} title={what}>
                <Icon name={ATTACHMENT_ICON[a.kind] ?? 'file'} />
                <span class="link-text">
                  <span class="link-title">{a.name}</span>
                  <span class="link-sub">{size(a.size)}</span>
                </span>
              </button>
            </div>
          )
        })}
      </div>
      <Notice place="attachments" />
    </div>
  )
}

function Comments({ issue }: { issue: IssueDetail }) {
  const [, app] = useApp()
  return (
    <div class="comments-block">
      <h3 class="block-title">
        Comments <span class="muted">({issue.comments.length})</span>
      </h3>
      {issue.comments.length ? (
        <ol class="comments">
          {issue.comments.map((c) => (
            <li
              key={c.id}
              class="comment"
              onContextMenu={(e) => {
                if ((e.target as Element).closest('a[href]')) return
                openMenu(e as unknown as MouseEvent, [{ label: 'Copy comment', icon: 'copy', onSelect: () => void app.copyText('comments', c.content, 'Copied the comment') }])
              }}
            >
              <Avatar userId={c.authorId} name={c.author} size={34} />
              <div class="comment-main">
                <div class="comment-head">
                  <span>
                    <span class="comment-author">{c.author}</span>
                    <span class="muted small comment-date">{longDate(c.created)}</span>
                  </span>
                  <MoreButton label="More for this comment" items={() => [{ label: 'Copy comment', icon: 'copy', onSelect: () => void app.copyText('comments', c.content, 'Copied the comment') }]} />
                </div>
                <Markdown text={c.content} issueKey={issue.key} place="comments" />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <Empty icon="comment">No comments yet.</Empty>
      )}
      <Notice place="comments" />
    </div>
  )
}

type DetailTab = 'attachments' | 'subtasking' | 'pullRequests' | 'links' | 'worktrees'

/** Backlog's tab strip under the card (Attachments, Subtasking…), with the rest this panel adds. */
function DetailTabs({ issue }: { issue: IssueDetail }) {
  const [s, app] = useApp()
  const runs = s.issueRuns?.key === issue.key ? s.issueRuns.runs.length : 0
  const linked = (issue.parent ? 1 : 0) + issue.children.length + issue.related.length
  const tabs: { id: DetailTab; label: string; icon: IconName; count: number }[] = [
    { id: 'attachments', label: 'Attachments', icon: 'clip', count: issue.attachments.length },
    { id: 'subtasking', label: 'Subtasking', icon: 'list', count: linked },
    { id: 'pullRequests', label: 'Pull requests', icon: 'pr', count: issue.pullRequests.length },
    { id: 'links', label: 'Links', icon: 'link', count: issue.links.length },
    { id: 'worktrees', label: 'Worktrees', icon: 'branch', count: runs }
  ]
  const tab = (tabs.some((t) => t.id === s.detailTab) ? s.detailTab : 'attachments') as DetailTab
  return (
    <div class="detail-tabs">
      <div class="tab-strip" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} class={cx('tab', t.id === tab && 'is-active')} onClick={() => app.set({ detailTab: t.id })}>
            <Icon name={t.icon} size={15} />
            <span>{t.label}</span>
            {t.count ? <span class="count">{t.count}</span> : null}
          </button>
        ))}
      </div>
      <div class="tab-panel" role="tabpanel">
        {tab === 'attachments' ? <Attachments issue={issue} /> : null}
        {tab === 'subtasking' ? <Linked issue={issue} /> : null}
        {tab === 'pullRequests' ? <PullRequests issue={issue} /> : null}
        {tab === 'links' ? <Links issue={issue} /> : null}
        {tab === 'worktrees' ? <Worktrees issue={issue} /> : null}
      </div>
    </div>
  )
}

function IssueBody({ issue, menu }: { issue: IssueDetail; menu: () => MenuItem[] }) {
  return (
    <div class="stack detail-stack">
      <IssueHeader issue={issue} menu={menu} />
      <IssueCard issue={issue} />
      <DetailTabs issue={issue} />
      <LaunchCard issue={issue} />
      <Comments issue={issue} />
    </div>
  )
}

// --- Update sheet --------------------------------------------------------------------------------

/** A list field (categories, milestones, versions) as one choice; several stay as they are. */
function OneOf(p: { label: string; ids: string[]; options: Option[]; onChange: (ids: string[]) => void }) {
  const several = p.ids.length > 1
  return (
    <Select
      label={p.label}
      value={several ? 'several' : (p.ids[0] ?? 'none')}
      disabled={several}
      options={[several ? { value: 'several', label: `${p.ids.length} chosen (edit in Backlog)` } : { value: 'none', label: 'None' }, ...p.options]}
      onChange={(v) => p.onChange(v === 'none' ? [] : [v])}
    />
  )
}

/**
 * Backlog's bar at the bottom: 📎, "Write a comment…" and Change Status. Each opens the sheet
 * with the comment box and the fields; 📎 also asks for files.
 */
function UpdateBar({ issue }: { issue: IssueDetail }) {
  const [s, app] = useApp()
  const form = s.editing
  if (!form || form.key !== issue.key) return null
  const pending = Object.keys(changesOf(issue.fields, form, 'fields')).length
  const open = () => app.set({ sheetOpen: true })
  // The sheet is not inside the bar: the bar's backdrop blur would pin a fixed child to the bar.
  return (
    <>
      <div class="update-bar">
        <IconButton
          icon="clip"
          label="Attach files to a comment"
          class="bar-clip"
          onClick={() => {
            open()
            void app.addFiles(issue)
          }}
        />
        <button type="button" class="fake-input" onClick={open}>
          {form.comment.trim() ? form.comment : 'Write a comment…'}
        </button>
        <Button size="sm" icon="edit" onClick={open}>
          {pending ? `Change Status (${pending})` : 'Change Status'}
        </Button>
      </div>
      <Sheet open={s.sheetOpen} title={`Update ${issue.key}`} onClose={() => app.set({ sheetOpen: false })} footer={<SheetFooter issue={issue} />}>
        <UpdateForm issue={issue} />
      </Sheet>
    </>
  )
}

function SheetFooter({ issue }: { issue: IssueDetail }) {
  const [s, app] = useApp()
  const form = s.editing!
  const changes = changesOf(issue.fields, form, 'fields')
  const fieldCount = Object.keys(changes).filter((c) => c !== 'comment' && c !== 'files').length
  const label = s.saving
    ? 'Saving…'
    : fieldCount
      ? `Save ${fieldCount} change${fieldCount > 1 ? 's' : ''}${changes.comment || changes.files ? ' and comment' : ''}`
      : 'Comment'
  return (
    <div class="row">
      <Button variant="primary" icon="check" disabled={s.saving || !Object.keys(changes).length} onClick={() => void app.saveIssue(issue, 'fields')}>
        {label}
      </Button>
      <Button variant="ghost" disabled={s.saving || !Object.keys(changes).length} onClick={() => app.discardFields(issue)}>
        Discard
      </Button>
    </div>
  )
}

function UpdateForm({ issue }: { issue: IssueDetail }) {
  const [s, app] = useApp()
  const [over, setOver] = useState(false)
  const form = s.editing!
  const meta = s.editMeta?.projectId === issue.projectId ? s.editMeta.meta : null
  const f = form.fields
  const take = (files: FileList | null | undefined) => {
    const list = [...(files ?? [])]
    if (list.length) void Promise.all(list.map(readFile)).then((read) => app.putFiles(issue, read))
  }
  return (
    <div
      class={`stack drop-zone${over ? ' is-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        take((e as unknown as DragEvent).dataTransfer?.files)
      }}
    >
      <Textarea
        label="Comment"
        rows={4}
        maxRows={14}
        autoFocus
        placeholder="Add a comment (Backlog formatting). Paste or drop images here."
        value={form.comment}
        onInput={(comment) => app.editComment(comment)}
        onSubmit={() => void app.saveIssue(issue, 'fields')}
        onPaste={(e) => {
          const files = e.clipboardData?.files
          if (files?.length) {
            e.preventDefault()
            take(files)
          }
        }}
      />
      <div class="row">
        <Button size="sm" variant="ghost" icon="clip" disabled={s.picking} onClick={() => void app.addFiles(issue)}>
          Attach file…
        </Button>
        {s.picking ? <Spinner label="Waiting for the files" /> : null}
      </div>
      {form.files.length ? (
        <div class="file-chips">
          {form.files.map((file) => (
            <span key={file.id} class="chip" title={file.kind === 'image' ? 'Shown in the comment' : 'Attached'}>
              <Icon name={file.kind === 'image' ? 'image' : 'file'} size={14} />
              <span class="chip-text">{file.name}</span>
              <span class="muted small">{size(file.size)}</span>
              <button type="button" class="chip-x" aria-label={`Remove ${file.name}`} onClick={() => app.removeFile(issue, file.id)}>
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {!meta ? (
        <Spinner label="Loading statuses and members" />
      ) : (
        <div class="filter-grid">
          <Select label="Status" value={f.statusId} options={meta.statuses} onChange={(statusId) => app.editFields({ statusId })} />
          <Select label="Resolution" value={f.resolutionId || 'none'} options={[{ value: 'none', label: 'None' }, ...meta.resolutions]} onChange={(v) => app.editFields({ resolutionId: v === 'none' ? '' : v })} />
          <Select label="Assignee" value={f.assigneeId || 'none'} options={[{ value: 'none', label: 'Unassigned' }, ...meta.users]} onChange={(v) => app.editFields({ assigneeId: v === 'none' ? '' : v })} />
          <Select label="Priority" value={f.priorityId} options={meta.priorities} onChange={(priorityId) => app.editFields({ priorityId })} />
          <Select label="Issue type" value={f.issueTypeId} options={meta.issueTypes} onChange={(issueTypeId) => app.editFields({ issueTypeId })} />
          <OneOf label="Category" ids={f.categoryIds} options={meta.categories} onChange={(categoryIds) => app.editFields({ categoryIds })} />
          <OneOf label="Milestone" ids={f.milestoneIds} options={meta.versions} onChange={(milestoneIds) => app.editFields({ milestoneIds })} />
          <OneOf label="Version" ids={f.versionIds} options={meta.versions} onChange={(versionIds) => app.editFields({ versionIds })} />
          <DateInput label="Start date" value={f.startDate} onInput={(startDate) => app.editFields({ startDate })} />
          <DateInput label="Due date" value={f.dueDate} onInput={(dueDate) => app.editFields({ dueDate })} />
          <Input label="Estimated hours" value={f.estimatedHours} invalid={badHours(f.estimatedHours)} onInput={(estimatedHours) => app.editFields({ estimatedHours })} />
          <Input label="Actual hours" value={f.actualHours} invalid={badHours(f.actualHours)} onInput={(actualHours) => app.editFields({ actualHours })} />
        </div>
      )}
      <Notice place="fields" />
    </div>
  )
}

/** A date as Backlog takes it (yyyy-MM-dd), with the browser's own picker. */
function DateInput({ label, value, onInput }: { label: string; value: string; onInput: (v: string) => void }) {
  return (
    <label class="field">
      <span class="field-label">{label}</span>
      <input class={`control${badDate(value) ? ' is-invalid' : ''}`} type="date" aria-label={label} value={value} onInput={(e) => onInput((e.currentTarget as HTMLInputElement).value)} />
    </label>
  )
}

export type { App, Place }
