// The top bar, Home (projects, my pull requests, My Issues) and a project's issue list.
import { h } from './vendor/preact.js';
import { advancedCount, ADVANCED, DUE_TABS, SUBTASKING } from './app.js';
import { Icon } from './icons.js';
import { IssueTable } from './table.js';
import { Avatar, Badge, Button, Callout, Checkbox, Empty, IconButton, MoreButton, Notice, openMenu, Section, Segmented, Select, Spinner, useApp } from './ui.js';
/** Orca's native select refuses nothing here, but long lists stay usable with a cap. */
const MAX_OPTIONS = 500;
export const withAll = (label, options) => [{ value: 'all', label }, ...options.slice(0, MAX_OPTIONS)];
// --- Top bar -------------------------------------------------------------------------------------
export function TopBar({ title, back, children }) {
    const [s, app] = useApp();
    return (h("header", { class: "topbar" },
        h("div", { class: "topbar-row" },
            back ? h(IconButton, { icon: "back", label: "Back", onClick: back }) : h("span", { class: "brand-mark", "aria-hidden": "true" }),
            h("h1", { class: "topbar-title", title: title }, title),
            h("div", { class: "topbar-actions" },
                children,
                s.aiStatus === 'available' && s.screen !== 'ai' ? h(IconButton, { icon: "bot", label: "Ask Backlog AI", onClick: () => app.openAi() }) : null,
                h(IconButton, { icon: "refresh", label: "Refresh", onClick: () => app.refresh() }),
                s.screen !== 'settings' ? h(IconButton, { icon: "settings", label: "Settings", onClick: () => app.openSettings() }) : null))));
}
/** The account in use; a change is remembered for the Orca project in focus. */
export function AccountPicker({ me }) {
    const [s, app] = useApp();
    // Always one button, with one account too: its menu switches, adds and manages accounts.
    const items = () => [
        ...s.accounts.map((a) => ({
            label: `${a.name} · ${a.space}`,
            icon: a.id === me.accountId ? 'check' : 'user',
            disabled: a.id === me.accountId,
            onSelect: () => void app.useAccount(a.id)
        })),
        'separator',
        { label: 'Add account…', icon: 'plus', onSelect: () => app.openSettings('settings.add') },
        { label: 'Manage accounts', icon: 'settings', onSelect: () => app.openSettings('settings.accounts') }
    ];
    return (h("div", { class: "account-line" },
        h("button", { type: "button", class: "account-btn", "aria-haspopup": "menu", title: s.orcaProject ? `Switching here also remembers the account for Orca project ${s.orcaProject.label}` : 'Switch account', onClick: (e) => openMenu(e, items()) },
            h(Avatar, { userId: me.me.id, name: me.me.name, size: 20 }),
            h("span", { class: "account-name" },
                me.me.name,
                " \u00B7 ",
                me.space),
            s.accounts.length > 1 ? h("span", { class: "count" }, s.accounts.length) : null,
            h(Icon, { name: "down", size: 14 })),
        s.orcaProject ? h("span", { class: "muted small account-project" },
            "for ",
            s.orcaProject.label) : null));
}
// --- Pull requests -------------------------------------------------------------------------------
export function linkMenu(app, place, url, extra = []) {
    return [
        { label: 'Open in browser', icon: 'external', onSelect: () => void app.linkAction(place, url, 'browser') },
        { label: "Open in Orca's browser", icon: 'globe', onSelect: () => void app.linkAction(place, url, 'orca') },
        { label: 'Copy link', icon: 'copy', onSelect: () => void app.linkAction(place, url, 'copy') },
        ...(extra.length ? ['separator', ...extra] : [])
    ];
}
/** One pull request: a click opens it; right-click or ⋯ for more; a red Conflict when git finds one. */
export function PrRow({ pr, place, check, showProject }) {
    const [, app] = useApp();
    const items = () => linkMenu(app, place, pr.url, [
        ...(pr.projectId ? [{ label: 'Assign to…', icon: 'user', onSelect: () => void app.assignPullRequest(pr, place) }] : []),
        { label: `Copy branch ${pr.branch}`, icon: 'branch', onSelect: () => void app.copyText(place, pr.branch, `Copied ${pr.branch}`) }
    ]);
    const conflict = check && check !== 'checking' && check.state === 'conflict' ? check : null;
    return (h("div", { class: "link-row", onContextMenu: (e) => openMenu(e, items()) },
        h("button", { type: "button", class: "link-main", onClick: () => void app.openLink(place, pr.url), title: pr.url },
            h(Icon, { name: "pr" }),
            h("span", { class: "link-text" },
                h("span", { class: "link-title" },
                    "#",
                    pr.number,
                    " ",
                    pr.summary),
                h("span", { class: "link-sub" },
                    showProject && pr.project ? `${pr.project} · ` : '',
                    pr.repo,
                    ": ",
                    pr.branch,
                    " \u2192 ",
                    pr.base,
                    !showProject ? ` · ${pr.status}` : '',
                    pr.author && !showProject ? ` · ${pr.author}` : '',
                    pr.assignee ? ` · → ${pr.assignee}` : '')),
            conflict ? (h("span", { title: conflict.files.length ? `Conflicts in ${conflict.files.join(', ')}` : undefined },
                h(Badge, { tone: "danger" }, "Conflict"))) : null),
        h(MoreButton, { label: `More for #${pr.number}`, items: items })));
}
function MyPullRequests() {
    const [s] = useApp();
    const { prs, loading, error } = s.myPrs;
    const conflicts = (prs ?? []).filter((pr) => s.prChecks[pr.key]?.state === 'conflict').length;
    return (h(Section, { id: "myPullRequests", title: "My pull requests", count: prs?.length },
        error ? h(Callout, { tone: "danger" }, error) : null,
        conflicts ? h("div", { class: "notice tone-danger" }, conflicts === 1 ? '1 pull request has conflicts.' : `${conflicts} pull requests have conflicts.`) : null,
        !prs ? (loading ? (h(Spinner, { label: "Loading pull requests" })) : null) : prs.length ? (h("div", { class: "link-list" }, prs.map((pr) => (h(PrRow, { key: pr.key, pr: pr, place: "myPullRequests", check: s.prChecks[pr.key], showProject: true }))))) : (h(Empty, { icon: "pr" }, "No open pull request of yours.")),
        h(Notice, { place: "myPullRequests" })));
}
// --- Home ----------------------------------------------------------------------------------------
function AiSignInHint() {
    const [s, app] = useApp();
    if (s.aiStatus !== 'signedOut')
        return null;
    return (h("div", { class: "hint-row" },
        h("span", { class: "muted" }, "Sign in to Backlog in Orca's browser to see whether Backlog AI is available."),
        h(Button, { size: "sm", variant: "ghost", icon: "external", onClick: () => void app.openAiOnWeb() }, "Sign in"),
        h(Button, { size: "sm", variant: "ghost", icon: "refresh", onClick: () => void app.loadAiStatus(true) }, "Check again")));
}
export function HomeView({ me }) {
    const [s, app] = useApp();
    const projects = s.meta?.projects;
    const d = s.dashboard;
    return (h("div", { class: "screen" },
        h(TopBar, { title: "Dashboard" }),
        h("div", { class: "screen-body" },
            h(AccountPicker, { me: me }),
            h(AiSignInHint, null),
            h(Section, { id: "projects", title: "Projects", count: projects?.length }, !projects ? (h(Spinner, { label: "Loading projects" })) : !projects.length ? (h(Empty, { icon: "folder" }, "No projects: this account is not in any Backlog project.")) : (h("div", { class: "project-grid" }, projects.map((p) => (h("button", { key: p.value, type: "button", class: "project-card", onClick: () => app.openProject(p.value), onContextMenu: (e) => openMenu(e, [{ label: 'Open issues', icon: 'list', onSelect: () => app.openProject(p.value) }]) },
                h("span", { class: "project-icon" }, p.label.replace(/\s*\(.*$/, '').slice(0, 1).toUpperCase()),
                h("span", { class: "project-name" }, p.label))))))),
            h(MyPullRequests, null),
            h(Section, { id: "myIssues", title: "My Issues" },
                h(Segmented, { options: [
                        { value: 'assigned', label: 'Assigned to me' },
                        { value: 'created', label: 'Created by me' }
                    ], value: d.who, counts: s.dashCounts, onChange: (who) => app.setDashboard({ who }) }),
                h(Segmented, { options: DUE_TABS, value: d.due, counts: s.dashCounts, onChange: (due) => app.setDashboard({ due }) }),
                h(IssueTable, { table: "home", label: "My issues", list: s.dashList, defaults: ['type', 'key', 'summary', 'priority', 'status', 'due'], sort: d.sort, onSort: (sort) => app.setDashboard({ sort }), onLoadMore: () => app.loadDashboard(true) })),
            h(Notice, { place: "issues" }))));
}
// --- Issues --------------------------------------------------------------------------------------
function AdvancedFilters() {
    const [s, app] = useApp();
    const f = s.filters;
    const m = s.meta;
    const count = advancedCount(f);
    const select = (key, label, options) => (h(Select, { label: label, value: f[key], disabled: !options.length, options: withAll(`Any ${label.toLowerCase()}`, options), onChange: (value) => app.setFilter({ [key]: value }) }));
    return (h("div", { class: "advanced" },
        h("div", { class: "row" },
            h(Button, { size: "sm", variant: "ghost", icon: "filter", active: s.advancedOpen, onClick: () => app.set({ advancedOpen: !s.advancedOpen }) }, `${s.advancedOpen ? 'Hide' : 'Advanced'} filters${count ? ` (${count})` : ''}`),
            count ? (h(Button, { size: "sm", variant: "ghost", onClick: () => app.setFilter({ ...ADVANCED }) }, "Clear")) : null),
        s.advancedOpen ? (h("div", { class: "filter-box" },
            f.projectId === 'all' ? h("div", { class: "muted small" }, "Choose a project for Issue type, Category, Version and Milestone.") : null,
            h("div", { class: "filter-grid" },
                select('issueTypeId', 'Issue type', m?.issueTypes ?? []),
                select('categoryId', 'Category', m?.categories ?? []),
                select('versionId', 'Version', m?.versions ?? []),
                select('milestoneId', 'Milestone', m?.versions ?? []),
                select('createdUserId', 'Registered by', m?.users ?? []),
                select('resolutionId', 'Resolution', m?.resolutions ?? []),
                h(Select, { label: "Subtasking", value: f.parentChild, options: SUBTASKING, onChange: (parentChild) => app.setFilter({ parentChild: parentChild }) })),
            h("div", { class: "row" },
                h(Checkbox, { label: "Attached", checked: f.attachment, onChange: (attachment) => app.setFilter({ attachment }) }),
                h(Checkbox, { label: "Shared", checked: f.sharedFile, onChange: (sharedFile) => app.setFilter({ sharedFile }) })))) : null));
}
export function IssuesView({ me }) {
    const [s, app] = useApp();
    const f = s.filters;
    const m = s.meta;
    const project = m?.projects.find((p) => p.value === f.projectId)?.label ?? 'All projects';
    return (h("div", { class: "screen" },
        h(TopBar, { title: project, back: () => app.goHome() }),
        h("div", { class: "screen-body" },
            h("div", { class: "search-row" },
                h(Icon, { name: "search" }),
                h("input", { class: "search-input", type: "search", "aria-label": "Search issues", placeholder: "Search key, subject, description", value: f.keyword, onInput: (e) => app.typeKeyword(e.currentTarget.value), onKeyDown: (e) => e.key === 'Enter' && void app.loadIssues() }),
                h("span", { class: "count", title: "Issues" }, s.issueList.total)),
            h("div", { class: "filter-grid" },
                h(Select, { label: "Project", value: f.projectId, options: withAll('All projects', m?.projects ?? []), onChange: (projectId) => app.setFilter({ projectId }) }),
                h(Select, { label: "Assignee", value: f.assignee, options: [
                        { value: 'me', label: 'Assigned to me' },
                        { value: 'all', label: 'Any assignee' },
                        ...(m?.users ?? []).filter((u) => u.value !== String(me.me.id)).slice(0, MAX_OPTIONS)
                    ], onChange: (assignee) => app.setFilter({ assignee }) }),
                h(Select, { label: "Status", value: f.status, options: [{ value: 'notClosed', label: 'Not closed' }, { value: 'all', label: 'All statuses' }, ...(m?.statuses ?? [])], onChange: (status) => app.setFilter({ status }) }),
                h(Select, { label: "Priority", value: f.priorityId, options: withAll('All priorities', m?.priorities ?? []), onChange: (priorityId) => app.setFilter({ priorityId }) })),
            h(AdvancedFilters, null),
            h(IssueTable, { table: "issues", label: "Issues", list: s.issueList, defaults: ['type', 'key', 'summary', 'assignee', 'status', 'priority', 'due', 'updated'], sort: f.sort, onSort: (sort) => app.setFilter({ sort }), onLoadMore: () => void app.loadIssues(true) }),
            h(Notice, { place: "issues" }))));
}
