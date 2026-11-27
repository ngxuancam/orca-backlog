// One issue, laid out like Backlog's issue page: the header with type, key and status, the
// properties, description, attachments, links, pull requests, worktrees, the agent hand-off and
// comments; "Comment / Update" opens a sheet from the bottom. Right-click anything for its actions.
import { Fragment, h } from './vendor/preact.js';
import { useState } from './vendor/hooks.js';
import { ago, changesOf, size } from './app.js';
import { Icon } from './icons.js';
import { Markdown } from './markdown.js';
import { linkMenu, PrRow, TopBar } from './screens.js';
import { issueMenu, issueUrl } from './table.js';
import { Button, Avatar, Callout, cx, Empty, IconButton, Input, MoreButton, Notice, openMenu, Pill, Priority, Section, Select, Sheet, Spinner, statusColor, Textarea, useApp } from './ui.js';
const NO_SKILL = 'none';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const badDate = (d) => Boolean(d) && !DATE.test(d);
const badHours = (h) => Boolean(h.trim()) && !(Number(h) >= 0);
/** A file the browser handed over (paste or drop), as base64 for the worker. */
async function readFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    // A pasted screenshot is named "image.png": give it a name that says when.
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const name = !file.name || /^image\.(png|jpe?g|gif)$/i.test(file.name) ? `paste-${stamp}.${file.type.split('/')[1] || 'png'}` : file.name;
    return { name, data: btoa(binary) };
}
export function DetailView({ issueKey }) {
    const [s, app] = useApp();
    const { issue, error } = s.detail;
    const space = s.session?.space ?? '';
    const headerMenu = () => [
        ...issueMenu(app, issueKey, issue?.summary, issue ?? undefined).filter((i) => i === 'separator' || i.label !== 'Open'),
        'separator',
        { label: 'Reload', icon: 'refresh', onSelect: () => void app.openIssue(issueKey) }
    ];
    return (h("div", { class: "screen" },
        h(TopBar, { title: issueKey, back: () => app.backFromIssue() },
            h(IconButton, { icon: "external", label: "Open in Backlog", onClick: () => void app.openLink('header', issueUrl(space, issueKey)) })),
        h("div", { class: "screen-body detail-body" },
            error ? h(Callout, { tone: "danger", title: "Cannot load issue" }, error) : null,
            !issue && !error ? h(Spinner, { label: "Loading issue" }) : null,
            issue ? h(IssueBody, { issue: issue, menu: headerMenu }) : null),
        issue ? h(UpdateBar, { issue: issue }) : null));
}
const today = () => new Date().toISOString().slice(0, 10);
const longDate = (time) => new Date(time).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
/** Backlog's issue header: type, key (copy), dates and status; the title with Summarize, Edit and ⋯. */
function IssueHeader({ issue, menu }) {
    const [s, app] = useApp();
    const overdue = Boolean(issue.due && issue.due < today() && issue.statusId !== 4);
    return (h("div", { class: "issue-head", onContextMenu: (e) => openMenu(e, menu()) },
        h("div", { class: "issue-head-line" },
            h(Pill, { kind: "type", color: issue.typeColor }, issue.type),
            h("span", { class: "issue-key-plain" }, issue.key),
            h(IconButton, { icon: "copy", label: `Copy ${issue.key}`, class: "tiny", onClick: () => void app.copyText('header', issue.key, `Copied ${issue.key}`) }),
            h("span", { class: "spacer" }),
            h("span", { class: "head-dates" },
                issue.startDate ? (h("span", { class: "head-date" },
                    h("span", { class: "head-date-label" }, "Start Date"),
                    " ",
                    issue.startDate)) : null,
                issue.due ? (h("span", { class: cx('head-date', overdue && 'is-overdue') },
                    h("span", { class: "head-date-label" }, "Due Date"),
                    " ",
                    issue.due,
                    overdue ? ' 🔥' : '')) : null),
            h(Pill, { color: statusColor(issue.statusId, issue.statusColor) }, issue.status)),
        h("h2", { class: "issue-title" }, issue.summary),
        h("div", { class: "issue-actions" },
            s.aiStatus === 'available' ? (h(Button, { size: "sm", icon: "bot", class: "btn-ai", onClick: () => app.askAiAbout(`Summarize the issue ${issue.key}: its status, what was decided in the comments, and what is left to do.`) }, "Summarize")) : null,
            h(Button, { size: "sm", icon: "edit", onClick: () => app.set({ editingText: true }) }, "Edit"),
            h(MoreButton, { label: `More for ${issue.key}`, items: menu })),
        h(Notice, { place: "header" })));
}
/** Subject and description, edited in place of the card's text. */
function EditText({ issue }) {
    const [s, app] = useApp();
    const form = s.editing;
    const changes = changesOf(issue.fields, form, 'text');
    return (h("div", { class: "edit-text" },
        h(Input, { label: "Subject", value: form.fields.summary, invalid: !form.fields.summary.trim(), onInput: (summary) => app.editFields({ summary }), onEnter: () => void app.saveIssue(issue, 'text'), autoFocus: true }),
        h(Textarea, { label: "Description", rows: 8, maxRows: 30, value: form.fields.description, onInput: (description) => app.editFields({ description }), onSubmit: () => void app.saveIssue(issue, 'text') }),
        h("div", { class: "row" },
            h(Button, { variant: "primary", icon: "check", disabled: s.saving || !Object.keys(changes).length || !form.fields.summary.trim(), onClick: () => void app.saveIssue(issue, 'text') }, s.saving ? 'Saving…' : 'Save'),
            h(Button, { variant: "ghost", disabled: s.saving, onClick: () => app.cancelText(issue) }, "Cancel"))));
}
/** The assignee, pressed to assign someone else (and, if it wants, the issue's pull requests). */
function AssigneeButton({ issue }) {
    const [, app] = useApp();
    return (h("button", { type: "button", class: "person person-btn", title: "Assign to\u2026", onClick: () => void app.assignIssue(issue, 'header') },
        issue.assignee ? h(Avatar, { userId: issue.assigneeId, name: issue.assignee, size: 22 }) : h(Icon, { name: "user", size: 14 }),
        h("span", null, issue.assignee ?? 'Unassigned')));
}
/** The card: who created it and when, the description, then the properties in two columns. */
function IssueCard({ issue }) {
    const [s, app] = useApp();
    const editing = s.editingText && s.editing?.key === issue.key;
    const propsOpen = !s.closedSections.includes('properties');
    return (h("div", { class: "issue-card" },
        h("div", { class: "author-row" },
            h(Avatar, { userId: issue.createdUserId, name: issue.createdUser, size: 34 }),
            h("div", null,
                h("div", { class: "comment-author" }, issue.createdUser ?? 'Someone'),
                h("div", { class: "muted small" },
                    "Created ",
                    longDate(issue.created)))),
        editing ? (h(EditText, { issue: issue })) : issue.description.trim() ? (h(Markdown, { text: issue.description, issueKey: issue.key, place: "description", class: "issue-description" })) : (h(Empty, { icon: "file" }, "No description.")),
        h(Notice, { place: "description" }),
        propsOpen ? h(Properties, { issue: issue }) : null,
        h("button", { type: "button", class: "props-toggle", "aria-label": propsOpen ? 'Hide properties' : 'Show properties', title: propsOpen ? 'Hide properties' : 'Show properties', onClick: () => app.toggleSection('properties') },
            h(Icon, { name: propsOpen ? 'up' : 'down', size: 14 }))));
}
function Properties({ issue }) {
    const rows = [
        ['Priority', issue.priority ? h(Priority, { name: issue.priority }) : null],
        [
            'Assignee',
            issue.assignee ? (h(AssigneeButton, { issue: issue })) : (h(AssigneeButton, { issue: issue }))
        ],
        ['Category', issue.categories.length ? h("span", { class: "prop-link" }, issue.categories.join(', ')) : null],
        ['Milestone', issue.milestones.length ? h("span", { class: "prop-link" }, issue.milestones.join(', ')) : null],
        ['Version', issue.version ? h("span", { class: "prop-link" }, issue.version) : null],
        ['Start Date', issue.startDate],
        ['Estimated Hours', issue.estimatedHours],
        ['Actual Hours', issue.actualHours],
        ['Resolution', issue.resolution],
        ['Registered by', issue.createdUser]
    ];
    return (h("dl", { class: "props" }, rows.map(([label, value]) => (h("div", { key: label, class: "prop" },
        h("dt", null, label),
        h("dd", null, value === null || value === undefined || value === '' ? '' : value))))));
}
function Linked({ issue }) {
    const [, app] = useApp();
    const items = [
        ...(issue.parent ? [{ role: 'Parent', ...issue.parent }] : []),
        ...issue.children.map((c) => ({ role: 'Child', ...c })),
        ...issue.related.map((r) => ({ role: 'Related', ...r }))
    ];
    if (!items.length)
        return h(Empty, { icon: "list" }, "No parent issue, subtask or related issue.");
    return (h("div", { class: "tab-body" },
        h("div", { class: "link-list" }, items.map((l) => {
            const menu = () => [{ label: 'Open here', icon: 'next', onSelect: () => app.followIssue(l.key) }, ...issueMenu(app, l.key, l.summary).slice(1)];
            return (h("div", { key: `${l.role}-${l.key}`, class: "link-row", onContextMenu: (e) => openMenu(e, menu()) },
                h("button", { type: "button", class: "link-main", onClick: () => app.followIssue(l.key) },
                    h("span", { class: "role" }, l.role),
                    h("span", { class: "link-text" },
                        h("span", { class: "link-title" },
                            h("span", { class: "issue-key" }, l.key),
                            " ",
                            l.summary)),
                    h(Pill, { color: statusColor(l.statusId) }, l.status)),
                h(MoreButton, { label: `More for ${l.key}`, items: menu })));
        }))));
}
function Links({ issue }) {
    const [, app] = useApp();
    return (h("div", { class: "tab-body" },
        issue.links.length ? null : h(Empty, { icon: "link" }, "No links."),
        h("div", { class: "link-list" }, issue.links.map((l) => (h("div", { key: l.url, class: "link-row", onContextMenu: (e) => openMenu(e, linkMenu(app, 'links', l.url)) },
            h("button", { type: "button", class: "link-main", title: l.url, onClick: () => void app.openLink('links', l.url) },
                h(Icon, { name: l.from === 'pull request' ? 'pr' : 'link' }),
                h("span", { class: "link-text" },
                    h("span", { class: "link-title" }, l.label),
                    h("span", { class: "link-sub" }, l.from === 'issue' ? l.url : `${l.from} · ${l.url}`))),
            h(MoreButton, { label: `More for ${l.label}`, items: () => linkMenu(app, 'links', l.url) }))))),
        h(Notice, { place: "links" })));
}
function PullRequests({ issue }) {
    const [s] = useApp();
    const prs = issue.pullRequests;
    return (h("div", { class: "tab-body" },
        prs.length ? (h("div", { class: "link-list" }, prs.map((pr) => (h(PrRow, { key: pr.key, pr: pr, place: "pullRequests", check: pr.statusId === 1 ? s.prChecks[pr.key] : undefined }))))) : (h(Empty, { icon: "pr" }, "No pull request links this issue.")),
        h(Notice, { place: "pullRequests" })));
}
function Worktrees({ issue }) {
    const [s, app] = useApp();
    const [pick, setPick] = useState('none');
    const runs = s.issueRuns?.key === issue.key ? s.issueRuns.runs : [];
    const agents = s.launchOptions?.agents ?? [];
    const linked = new Set(runs.map((r) => `ws:${r.workspaceId}`));
    const choices = (s.launchOptions?.targets ?? []).filter((t) => t.value.startsWith('ws:') && !linked.has(t.value));
    const value = choices.some((c) => c.value === pick) ? pick : 'none';
    return (h("div", { class: "tab-body" },
        runs.length ? null : h(Empty, { icon: "branch" }, "No worktree for this issue yet: start an agent, or link one below."),
        h("div", { class: "link-list" }, runs.map((run) => {
            const menu = () => [
                { label: 'Show with its terminal', icon: 'agent', onSelect: () => void app.focusRun(run.workspaceId) },
                ...(run.branch ? [{ label: `Copy branch ${run.branch}`, icon: 'branch', onSelect: () => void app.copyText('worktrees', run.branch, `Copied ${run.branch}`) }] : []),
                'separator',
                { label: 'Unlink from this issue', icon: 'close', danger: true, onSelect: () => void app.linkRun(issue.key, run.workspaceId, 'unlink') }
            ];
            return (h("div", { key: run.workspaceId, class: "link-row", onContextMenu: (e) => openMenu(e, menu()) },
                h("button", { type: "button", class: "link-main", onClick: () => void app.focusRun(run.workspaceId) },
                    h(Icon, { name: "branch" }),
                    h("span", { class: "link-text" },
                        h("span", { class: "link-title" }, run.label),
                        h("span", { class: "link-sub" }, [run.agent ? (agents.find((a) => a.value === run.agent)?.label ?? run.agent) : 'linked', run.skill, run.branch, `${run.agent ? 'started' : 'since'} ${ago(run.startedAt)}`]
                            .filter(Boolean)
                            .join(' · ')))),
                h(MoreButton, { label: `More for ${run.label}`, items: menu })));
        })),
        choices.length ? (h("div", { class: "row align-end" },
            h("div", { class: "grow" },
                h(Select, { label: "Link a worktree", value: value, options: [{ value: 'none', label: 'Pick an existing worktree' }, ...choices], onChange: setPick })),
            h(Button, { icon: "link", disabled: value === 'none', onClick: () => void app.linkRun(issue.key, value.slice(3), 'link').then(() => setPick('none')) }, "Link"))) : null,
        h(Notice, { place: "worktrees" })));
}
function LaunchCard({ issue }) {
    const [s, app] = useApp();
    const options = s.launchOptions;
    const c = s.choice;
    const draft = s.promptDraft;
    return (h(Section, { id: "launch", title: "Assign to an agent" }, !options ? (h(Spinner, { label: "Loading agents and skills" })) : !options.agents.length || !options.targets.length ? (h(Empty, { icon: "agent" }, !options.agents.length ? 'No agent is installed in Orca.' : 'No workspace to start an agent in.')) : (h("div", { class: "stack" },
        h("div", { class: "filter-grid" },
            h(Select, { label: "Workspace", value: c.target, options: options.targets, onChange: (target) => app.choose(issue.key, { target }) }),
            h(Select, { label: "Agent", value: c.agent, options: options.agents, onChange: (agent) => app.choose(issue.key, { agent }) }),
            h(Select, { label: "Skill", value: c.skill || NO_SKILL, options: [{ value: NO_SKILL, label: 'No skill' }, ...options.skills.filter((k) => !k.providers.length || k.providers.includes(c.agent))], onChange: (skill) => app.choose(issue.key, { skill: skill === NO_SKILL ? '' : skill }) })),
        h(Textarea, { label: c.skill ? 'Sent to the agent' : 'Prompt', rows: c.skill ? 2 : 6, maxRows: 16, placeholder: draft && !draft.text && !draft.edited ? 'Writing the prompt…' : 'What the agent should do', value: draft?.text ?? '', onInput: (text) => app.set({ promptDraft: { basis: draft?.basis ?? issue.key, text, edited: true } }), onSubmit: () => void app.startAgent(issue.key) }),
        h("div", { class: "row" },
            h(Button, { variant: "primary", icon: "agent", disabled: !c.target || !c.agent || s.launching, onClick: () => void app.startAgent(issue.key) }, s.launching ? 'Starting…' : 'Start agent'),
            draft?.edited ? (h(Button, { variant: "ghost", icon: "refresh", onClick: () => void app.refreshPrompt(issue.key, true) }, "Reset prompt")) : null),
        h(Notice, { place: "launch" })))));
}
const ATTACHMENT_ICON = { image: 'image', video: 'video', file: 'file' };
function Attachments({ issue }) {
    const [, app] = useApp();
    if (!issue.attachments.length)
        return h(Empty, { icon: "clip" }, "No attachments.");
    return (h("div", { class: "tab-body" },
        h("div", { class: "link-list" }, issue.attachments.map((a) => {
            const open = () => void app.openAttachment(issue.key, a.id);
            const what = a.kind === 'file' ? 'Download and open its folder' : 'Preview in Orca';
            return (h("div", { key: a.id, class: "link-row", onContextMenu: (e) => openMenu(e, [{ label: what, icon: a.kind === 'file' ? 'folder' : 'image', onSelect: open }]) },
                h("button", { type: "button", class: "link-main", onClick: open, title: what },
                    h(Icon, { name: ATTACHMENT_ICON[a.kind] ?? 'file' }),
                    h("span", { class: "link-text" },
                        h("span", { class: "link-title" }, a.name),
                        h("span", { class: "link-sub" }, size(a.size))))));
        })),
        h(Notice, { place: "attachments" })));
}
function Comments({ issue }) {
    const [, app] = useApp();
    return (h("div", { class: "comments-block" },
        h("h3", { class: "block-title" },
            "Comments ",
            h("span", { class: "muted" },
                "(",
                issue.comments.length,
                ")")),
        issue.comments.length ? (h("ol", { class: "comments" }, issue.comments.map((c) => (h("li", { key: c.id, class: "comment", onContextMenu: (e) => {
                if (e.target.closest('a[href]'))
                    return;
                openMenu(e, [{ label: 'Copy comment', icon: 'copy', onSelect: () => void app.copyText('comments', c.content, 'Copied the comment') }]);
            } },
            h(Avatar, { userId: c.authorId, name: c.author, size: 34 }),
            h("div", { class: "comment-main" },
                h("div", { class: "comment-head" },
                    h("span", null,
                        h("span", { class: "comment-author" }, c.author),
                        h("span", { class: "muted small comment-date" }, longDate(c.created))),
                    h(MoreButton, { label: "More for this comment", items: () => [{ label: 'Copy comment', icon: 'copy', onSelect: () => void app.copyText('comments', c.content, 'Copied the comment') }] })),
                h(Markdown, { text: c.content, issueKey: issue.key, place: "comments" }))))))) : (h(Empty, { icon: "comment" }, "No comments yet.")),
        h(Notice, { place: "comments" })));
}
/** Backlog's tab strip under the card (Attachments, Subtasking…), with the rest this panel adds. */
function DetailTabs({ issue }) {
    const [s, app] = useApp();
    const runs = s.issueRuns?.key === issue.key ? s.issueRuns.runs.length : 0;
    const linked = (issue.parent ? 1 : 0) + issue.children.length + issue.related.length;
    const tabs = [
        { id: 'attachments', label: 'Attachments', icon: 'clip', count: issue.attachments.length },
        { id: 'subtasking', label: 'Subtasking', icon: 'list', count: linked },
        { id: 'pullRequests', label: 'Pull requests', icon: 'pr', count: issue.pullRequests.length },
        { id: 'links', label: 'Links', icon: 'link', count: issue.links.length },
        { id: 'worktrees', label: 'Worktrees', icon: 'branch', count: runs }
    ];
    const tab = (tabs.some((t) => t.id === s.detailTab) ? s.detailTab : 'attachments');
    return (h("div", { class: "detail-tabs" },
        h("div", { class: "tab-strip", role: "tablist" }, tabs.map((t) => (h("button", { key: t.id, type: "button", role: "tab", "aria-selected": t.id === tab, class: cx('tab', t.id === tab && 'is-active'), onClick: () => app.set({ detailTab: t.id }) },
            h(Icon, { name: t.icon, size: 15 }),
            h("span", null, t.label),
            t.count ? h("span", { class: "count" }, t.count) : null)))),
        h("div", { class: "tab-panel", role: "tabpanel" },
            tab === 'attachments' ? h(Attachments, { issue: issue }) : null,
            tab === 'subtasking' ? h(Linked, { issue: issue }) : null,
            tab === 'pullRequests' ? h(PullRequests, { issue: issue }) : null,
            tab === 'links' ? h(Links, { issue: issue }) : null,
            tab === 'worktrees' ? h(Worktrees, { issue: issue }) : null)));
}
function IssueBody({ issue, menu }) {
    return (h("div", { class: "stack detail-stack" },
        h(IssueHeader, { issue: issue, menu: menu }),
        h(IssueCard, { issue: issue }),
        h(DetailTabs, { issue: issue }),
        h(LaunchCard, { issue: issue }),
        h(Comments, { issue: issue })));
}
// --- Update sheet --------------------------------------------------------------------------------
/** A list field (categories, milestones, versions) as one choice; several stay as they are. */
function OneOf(p) {
    const several = p.ids.length > 1;
    return (h(Select, { label: p.label, value: several ? 'several' : (p.ids[0] ?? 'none'), disabled: several, options: [several ? { value: 'several', label: `${p.ids.length} chosen (edit in Backlog)` } : { value: 'none', label: 'None' }, ...p.options], onChange: (v) => p.onChange(v === 'none' ? [] : [v]) }));
}
/**
 * Backlog's bar at the bottom: 📎, "Write a comment…" and Change Status. Each opens the sheet
 * with the comment box and the fields; 📎 also asks for files.
 */
function UpdateBar({ issue }) {
    const [s, app] = useApp();
    const form = s.editing;
    if (!form || form.key !== issue.key)
        return null;
    const pending = Object.keys(changesOf(issue.fields, form, 'fields')).length;
    const open = () => app.set({ sheetOpen: true });
    // The sheet is not inside the bar: the bar's backdrop blur would pin a fixed child to the bar.
    return (h(Fragment, null,
        h("div", { class: "update-bar" },
            h(IconButton, { icon: "clip", label: "Attach files to a comment", class: "bar-clip", onClick: () => {
                    open();
                    void app.addFiles(issue);
                } }),
            h("button", { type: "button", class: "fake-input", onClick: open }, form.comment.trim() ? form.comment : 'Write a comment…'),
            h(Button, { size: "sm", icon: "edit", onClick: open }, pending ? `Change Status (${pending})` : 'Change Status')),
        h(Sheet, { open: s.sheetOpen, title: `Update ${issue.key}`, onClose: () => app.set({ sheetOpen: false }), footer: h(SheetFooter, { issue: issue }) },
            h(UpdateForm, { issue: issue }))));
}
function SheetFooter({ issue }) {
    const [s, app] = useApp();
    const form = s.editing;
    const changes = changesOf(issue.fields, form, 'fields');
    const fieldCount = Object.keys(changes).filter((c) => c !== 'comment' && c !== 'files').length;
    const label = s.saving
        ? 'Saving…'
        : fieldCount
            ? `Save ${fieldCount} change${fieldCount > 1 ? 's' : ''}${changes.comment || changes.files ? ' and comment' : ''}`
            : 'Comment';
    return (h("div", { class: "row" },
        h(Button, { variant: "primary", icon: "check", disabled: s.saving || !Object.keys(changes).length, onClick: () => void app.saveIssue(issue, 'fields') }, label),
        h(Button, { variant: "ghost", disabled: s.saving || !Object.keys(changes).length, onClick: () => app.discardFields(issue) }, "Discard")));
}
function UpdateForm({ issue }) {
    const [s, app] = useApp();
    const [over, setOver] = useState(false);
    const form = s.editing;
    const meta = s.editMeta?.projectId === issue.projectId ? s.editMeta.meta : null;
    const f = form.fields;
    const take = (files) => {
        const list = [...(files ?? [])];
        if (list.length)
            void Promise.all(list.map(readFile)).then((read) => app.putFiles(issue, read));
    };
    return (h("div", { class: `stack drop-zone${over ? ' is-over' : ''}`, onDragOver: (e) => {
            e.preventDefault();
            setOver(true);
        }, onDragLeave: () => setOver(false), onDrop: (e) => {
            e.preventDefault();
            setOver(false);
            take(e.dataTransfer?.files);
        } },
        h(Textarea, { label: "Comment", rows: 4, maxRows: 14, autoFocus: true, placeholder: "Add a comment (Backlog formatting). Paste or drop images here.", value: form.comment, onInput: (comment) => app.editComment(comment), onSubmit: () => void app.saveIssue(issue, 'fields'), onPaste: (e) => {
                const files = e.clipboardData?.files;
                if (files?.length) {
                    e.preventDefault();
                    take(files);
                }
            } }),
        h("div", { class: "row" },
            h(Button, { size: "sm", variant: "ghost", icon: "clip", disabled: s.picking, onClick: () => void app.addFiles(issue) }, "Attach file\u2026"),
            s.picking ? h(Spinner, { label: "Waiting for the files" }) : null),
        form.files.length ? (h("div", { class: "file-chips" }, form.files.map((file) => (h("span", { key: file.id, class: "chip", title: file.kind === 'image' ? 'Shown in the comment' : 'Attached' },
            h(Icon, { name: file.kind === 'image' ? 'image' : 'file', size: 14 }),
            h("span", { class: "chip-text" }, file.name),
            h("span", { class: "muted small" }, size(file.size)),
            h("button", { type: "button", class: "chip-x", "aria-label": `Remove ${file.name}`, onClick: () => app.removeFile(issue, file.id) },
                h(Icon, { name: "close", size: 12 }))))))) : null,
        !meta ? (h(Spinner, { label: "Loading statuses and members" })) : (h("div", { class: "filter-grid" },
            h(Select, { label: "Status", value: f.statusId, options: meta.statuses, onChange: (statusId) => app.editFields({ statusId }) }),
            h(Select, { label: "Resolution", value: f.resolutionId || 'none', options: [{ value: 'none', label: 'None' }, ...meta.resolutions], onChange: (v) => app.editFields({ resolutionId: v === 'none' ? '' : v }) }),
            h(Select, { label: "Assignee", value: f.assigneeId || 'none', options: [{ value: 'none', label: 'Unassigned' }, ...meta.users], onChange: (v) => app.editFields({ assigneeId: v === 'none' ? '' : v }) }),
            h(Select, { label: "Priority", value: f.priorityId, options: meta.priorities, onChange: (priorityId) => app.editFields({ priorityId }) }),
            h(Select, { label: "Issue type", value: f.issueTypeId, options: meta.issueTypes, onChange: (issueTypeId) => app.editFields({ issueTypeId }) }),
            h(OneOf, { label: "Category", ids: f.categoryIds, options: meta.categories, onChange: (categoryIds) => app.editFields({ categoryIds }) }),
            h(OneOf, { label: "Milestone", ids: f.milestoneIds, options: meta.versions, onChange: (milestoneIds) => app.editFields({ milestoneIds }) }),
            h(OneOf, { label: "Version", ids: f.versionIds, options: meta.versions, onChange: (versionIds) => app.editFields({ versionIds }) }),
            h(DateInput, { label: "Start date", value: f.startDate, onInput: (startDate) => app.editFields({ startDate }) }),
            h(DateInput, { label: "Due date", value: f.dueDate, onInput: (dueDate) => app.editFields({ dueDate }) }),
            h(Input, { label: "Estimated hours", value: f.estimatedHours, invalid: badHours(f.estimatedHours), onInput: (estimatedHours) => app.editFields({ estimatedHours }) }),
            h(Input, { label: "Actual hours", value: f.actualHours, invalid: badHours(f.actualHours), onInput: (actualHours) => app.editFields({ actualHours }) }))),
        h(Notice, { place: "fields" })));
}
/** A date as Backlog takes it (yyyy-MM-dd), with the browser's own picker. */
function DateInput({ label, value, onInput }) {
    return (h("label", { class: "field" },
        h("span", { class: "field-label" }, label),
        h("input", { class: `control${badDate(value) ? ' is-invalid' : ''}`, type: "date", "aria-label": label, value: value, onInput: (e) => onInput(e.currentTarget.value) })));
}
