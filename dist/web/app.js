import { Store } from './store.js';
const NO_DIALOGS = { confirm: async () => false, pickMember: async () => undefined };
export const ADVANCED = {
    issueTypeId: 'all',
    categoryId: 'all',
    versionId: 'all',
    milestoneId: 'all',
    createdUserId: 'all',
    resolutionId: 'all',
    parentChild: '0',
    attachment: false,
    sharedFile: false
};
/** Advanced fields that belong to one project, reset when the project changes. */
const PER_PROJECT = { issueTypeId: 'all', categoryId: 'all', versionId: 'all', milestoneId: 'all' };
export const DEFAULT_FILTERS = {
    projectId: 'all',
    assignee: 'me',
    status: 'notClosed',
    priorityId: 'all',
    keyword: '',
    sort: { column: 'updated', direction: 'desc' },
    ...ADVANCED
};
const emptyList = { rows: [], total: 0, loading: false, error: null };
/** What survives a reload: where the person was and how they set things up. */
const PERSISTED = [
    'screen',
    'dashboard',
    'filters',
    'advancedOpen',
    'openKey',
    'trail',
    'choice',
    'sheetOpen',
    'columns',
    'widths',
    'closedSections',
    'detailTab'
];
export const STORAGE_KEY = 'web.panel';
export function initialState() {
    return {
        session: undefined,
        authError: null,
        accounts: [],
        orcaProject: null,
        form: { space: '', apiKey: '' },
        found: null,
        screen: 'home',
        meta: null,
        dashboard: { who: 'assigned', due: 'all', sort: { column: 'due', direction: 'asc' } },
        dashList: emptyList,
        dashCounts: {},
        filters: DEFAULT_FILTERS,
        advancedOpen: false,
        issueList: emptyList,
        openKey: null,
        trail: [],
        detail: { issue: null, error: null },
        notice: null,
        launchOptions: null,
        choice: { target: '', agent: '', skill: '' },
        launching: false,
        promptDraft: null,
        editing: null,
        editMeta: null,
        saving: false,
        editingText: false,
        sheetOpen: false,
        picking: false,
        issueRuns: null,
        prChecks: {},
        myPrs: { prs: null, loading: false, error: null },
        settings: null,
        connection: null,
        connectionTest: null,
        audit: null,
        confirmClear: false,
        aiStatus: null,
        aiChat: { threadId: null, title: null, turns: [] },
        aiHistory: null,
        aiShowHistory: false,
        aiSearch: '',
        aiDraft: '',
        aiAsking: null,
        aiLoading: null,
        columns: {},
        widths: {},
        closedSections: [],
        focusSection: null,
        detailTab: 'attachments',
        dark: false
    };
}
// --- Pure helpers (tested) -----------------------------------------------------------------------
export const message = (error) => (error instanceof Error ? error.message : String(error));
/** Table column → Backlog `sort`. Keys sort as creation order, which is how Backlog numbers them. */
export const SORT_BY = {
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
};
/** Every column a table can show, in Backlog's order, with its default width in px. */
export const COLUMNS = {
    type: { key: 'type', label: 'Type', width: 96, sortable: true },
    key: { key: 'key', label: 'Key', width: 96, sortable: true },
    summary: { key: 'summary', label: 'Subject', width: 260, sortable: true },
    assignee: { key: 'assignee', label: 'Assignee', width: 110, sortable: true },
    status: { key: 'status', label: 'Status', width: 104, sortable: true },
    priority: { key: 'priority', label: 'Priority', width: 72, sortable: true },
    created: { key: 'created', label: 'Created', width: 96, sortable: true },
    startDate: { key: 'startDate', label: 'Start', width: 96, sortable: true },
    due: { key: 'due', label: 'Due', width: 96, sortable: true },
    updated: { key: 'updated', label: 'Updated', width: 96, sortable: true },
    createdUser: { key: 'createdUser', label: 'Registered by', width: 110, sortable: true },
    updatedUser: { key: 'updatedUser', label: 'Updated by', width: 110, sortable: true },
    category: { key: 'category', label: 'Category', width: 110, sortable: true },
    milestone: { key: 'milestone', label: 'Milestone', width: 110, sortable: true },
    version: { key: 'version', label: 'Version', width: 110, sortable: true },
    resolution: { key: 'resolution', label: 'Resolution', width: 100, sortable: false },
    estimatedHours: { key: 'estimatedHours', label: 'Estimated', width: 80, sortable: true, align: 'end' },
    actualHours: { key: 'actualHours', label: 'Actual', width: 80, sortable: true, align: 'end' }
};
export const COLUMN_ORDER = Object.keys(COLUMNS);
export const MIN_WIDTH = 48;
export const DUE_TABS = [
    { value: 'all', label: 'All' },
    { value: '4days', label: '4 Days' },
    { value: 'today', label: 'Due Today' },
    { value: 'overdue', label: 'Overdue' }
];
export const SUBTASKING = [
    { value: '0', label: 'All issues' },
    { value: '4', label: 'Parent issues' },
    { value: '2', label: 'Subtasks only' },
    { value: '1', label: 'Exclude subtasks' },
    { value: '3', label: 'Neither parent nor subtask' }
];
/** `{ [name]: value }`, or nothing for "all": the bridge refuses fields set to undefined. */
const picked = (name, value) => (value === 'all' ? {} : { [name]: value });
export function issueFilterOf(f) {
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
    };
}
/** How many advanced filters narrow the list now. */
export function advancedCount(f) {
    return Object.keys(ADVANCED).filter((k) => f[k] !== ADVANCED[k]).length;
}
/** Not-closed issues assigned to me or created by me, as Backlog's dashboard counts them. */
export const dashFilter = (who, due) => ({
    status: 'notClosed',
    assignee: who === 'assigned' ? 'me' : 'all',
    createdByMe: who === 'created',
    due
});
/** The header edits these two; the bottom sheet the rest and the comment. */
const TEXT_FIELDS = ['summary', 'description'];
const inPart = (part, name) => (part === 'text') === TEXT_FIELDS.includes(name);
const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** What the form changed in one part, field by field; the fields part carries the comment and files. */
export function changesOf(from, form, part) {
    const changes = {};
    for (const [name, value] of Object.entries(form.fields)) {
        if (inPart(part, name) && !sameValue(value, from[name]))
            changes[name] = value;
    }
    const files = part === 'fields' ? (form.files ?? []).map((f) => f.id) : [];
    return {
        ...changes,
        ...(part === 'fields' && form.comment.trim() ? { comment: form.comment } : {}),
        ...(files.length ? { files } : {})
    };
}
export function columnsOf(state, table, defaults) {
    const chosen = state.columns[table] ?? defaults;
    return COLUMN_ORDER.filter((c) => c === 'key' || chosen.includes(c));
}
export const widthOf = (state, table, column) => state.widths[table]?.[column] ?? COLUMNS[column]?.width ?? 100;
export function size(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let n = bytes;
    let u = 0;
    while (n >= 1024 && u < units.length - 1)
        (n /= 1024), u++;
    return `${n.toFixed(u ? 1 : 0)} ${units[u]}`;
}
/** "3 min ago", "2 d ago". */
export function ago(time, now = Date.now()) {
    const minutes = Math.max(0, Math.round((now - time) / 60_000));
    if (minutes < 1)
        return 'just now';
    if (minutes < 60)
        return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24)
        return `${hours} h ago`;
    const days = Math.round(hours / 24);
    return days < 31 ? `${days} d ago` : new Date(time).toISOString().slice(0, 10);
}
const luminance = (hex) => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m)
        return null;
    const [r, g, b] = [m[1], m[2], m[3]].map((x) => {
        const c = parseInt(x, 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const DARK_TEXT = '#1f2328';
/**
 * Backlog's issue-type palette (its `colorId` 1–10: red, orange, pink, purple, aqua, green, lime,
 * yellow, shocking pink, black): the light colour the API returns → the shade its dark mode draws.
 */
const TYPE_DARK = {
    '#ea2c00': '#e22c35',
    '#ea733b': '#d4642f',
    '#e07b9a': '#b35370',
    '#868cb7': '#6c73a7',
    '#3b9dbd': '#2f7e98',
    '#4caf93': '#11837f',
    '#a1af2f': '#84920b',
    '#dc9925': '#9e8012',
    '#f42858': '#de0b63',
    '#393939': '#636363'
};
/** An issue type's colour for the theme, as Backlog shows it. */
export const typeColor = (hex, dark) => !hex ? null : dark ? (TYPE_DARK[hex.toLowerCase()] ?? hex) : hex;
/**
 * Text that stays readable on a colour set in Backlog, as Backlog draws it: dark on light colours
 * (yellow, light green, light blue, orange), white on dark ones (dark red, grey, blue).
 */
export function textOn(hex) {
    const l = luminance(hex ?? '');
    if (l === null)
        return '#fff';
    // Backlog leans to white: dark text only where white would fall below 3:1 (light colours).
    return 1.05 / (l + 0.05) >= 3 ? '#fff' : DARK_TEXT;
}
/** Tool names as the assistant reports them (`search-issues-tool`) → `search issues`. */
export const toolLabel = (name) => name.replace(/-tool$/, '').replace(/[-_]+/g, ' ');
// --- The app -------------------------------------------------------------------------------------
const SUCCESS_FADES_MS = 4000;
export class App {
    host;
    dialogs;
    store = new Store(initialState());
    #seqs = new Map();
    #noticeTimer;
    #keywordTimer;
    #saveTimer;
    #myPrsSeq = 0;
    constructor(host, dialogs = NO_DIALOGS) {
        this.host = host;
        this.dialogs = dialogs;
    }
    /** Members of a project, per project while the panel is open. */
    #members = new Map();
    membersOf(projectId) {
        let members = this.#members.get(projectId);
        if (!members) {
            members = this.host.request('meta.get', { projectId: String(projectId) }).then((m) => m.users);
            members.catch(() => this.#members.delete(projectId));
            this.#members.set(projectId, members);
        }
        return members;
    }
    /** Users' icons as `data:` URLs, fetched once each. */
    #icons = new Map();
    userIcon(userId) {
        let icon = this.#icons.get(userId);
        if (!icon) {
            icon = this.host.request('user.icon', { userId }).then(({ mime, data }) => `data:${mime};base64,${data}`);
            icon.catch(() => undefined);
            this.#icons.set(userId, icon);
        }
        return icon;
    }
    get state() {
        return this.store.state;
    }
    set(part) {
        const before = this.state;
        this.store.set(part);
        if (PERSISTED.some((k) => before[k] !== this.state[k]))
            this.#persist();
    }
    #persist() {
        clearTimeout(this.#saveTimer);
        this.#saveTimer = setTimeout(() => {
            const saved = Object.fromEntries(PERSISTED.map((k) => [k, this.state[k]]));
            void this.host.storageSet(STORAGE_KEY, saved).catch(() => undefined);
        }, 300);
    }
    /** The last action's result, at its place; a success fades after a few seconds. */
    say(place, tone, text) {
        clearTimeout(this.#noticeTimer);
        const next = { place, tone, text };
        this.set({ notice: next });
        if (tone === 'success')
            this.#noticeTimer = setTimeout(() => this.state.notice === next && this.set({ notice: null }), SUCCESS_FADES_MS);
    }
    /** Loads what was persisted, then signs in. */
    async start() {
        try {
            const saved = (await this.host.storageGet(STORAGE_KEY));
            if (saved && typeof saved === 'object') {
                const keep = Object.fromEntries(PERSISTED.filter((k) => k in saved).map((k) => [k, saved[k]]));
                if (keep.filters)
                    keep.filters = { ...DEFAULT_FILTERS, ...keep.filters };
                this.store.set(keep);
            }
        }
        catch {
            // A fresh start.
        }
        const ok = await this.runAuth(() => this.host.request('auth.status'));
        if (!ok)
            this.set({ session: null });
    }
    // --- Session -----------------------------------------------------------------------------------
    /** Shows what the worker answered; another account starts from Home with its own data. */
    applyAuth(next) {
        const before = this.state.session?.accountId;
        this.set({ session: next.session, accounts: next.accounts, orcaProject: next.orcaProject, authError: next.error ?? null });
        if (!next.session)
            void this.loadFound();
        if (!next.session || next.session.accountId === before)
            return;
        if (before) {
            // Project, status and user ids belong to the old space.
            this.set((s) => ({
                openKey: null,
                filters: { ...s.filters, projectId: 'all', assignee: 'me', status: 'notClosed', priorityId: 'all' },
                screen: s.screen === 'issues' ? 'home' : s.screen
            }));
        }
        void this.loadMeta();
        void this.loadAiStatus();
        this.refresh();
        const key = this.state.openKey;
        if (key && this.state.detail.issue?.key !== key)
            void this.openIssue(key);
    }
    async runAuth(task) {
        try {
            this.applyAuth(await task());
            return true;
        }
        catch (error) {
            this.set({ authError: message(error) });
            return false;
        }
    }
    async login() {
        if (await this.runAuth(() => this.host.request('auth.login', this.state.form))) {
            this.set({ form: { space: '', apiKey: '' } });
            if (this.state.screen === 'settings')
                void this.loadSettings();
        }
    }
    async loadFound() {
        this.set({ found: null });
        try {
            this.set({ found: await this.host.request('credentials.found') });
        }
        catch (error) {
            this.set({ found: [], authError: message(error) });
        }
    }
    async useFound(id) {
        const ok = await this.runAuth(() => this.host.request('credentials.use', { id }));
        void this.loadFound();
        if (ok && this.state.screen === 'settings')
            void this.loadSettings();
    }
    useAccount = (id) => this.runAuth(() => this.host.request('account.use', { id }));
    async removeAccount(id) {
        const a = this.state.accounts.find((x) => x.id === id);
        const ok = await this.dialogs.confirm({
            title: 'Remove this account?',
            message: a ? `${a.name} · ${a.space}: its API key is deleted from this computer.` : undefined,
            yes: 'Remove',
            danger: true
        });
        if (!ok)
            return;
        await this.runAuth(() => this.host.request('account.remove', { id }));
        void this.loadSettings();
    }
    // --- Navigation --------------------------------------------------------------------------------
    goTo(screen) {
        this.set({ screen, openKey: null });
    }
    goHome() {
        this.goTo('home');
        this.loadDashboard();
        void this.loadMyPrs();
        void this.loadAiStatus();
    }
    refresh() {
        const { screen, openKey } = this.state;
        if (openKey)
            return void this.openIssue(openKey);
        if (screen === 'home') {
            this.loadDashboard();
            void this.loadMyPrs();
            void this.loadAiStatus(true);
        }
        else if (screen === 'issues')
            void this.loadIssues();
        else if (screen === 'settings')
            void this.loadSettings();
        else if (screen === 'ai')
            void this.loadAiHistory();
    }
    toggleSection(id) {
        const closed = this.state.closedSections;
        this.set({ closedSections: closed.includes(id) ? closed.filter((s) => s !== id) : [...closed, id] });
    }
    // --- Lists -------------------------------------------------------------------------------------
    /** Only the newest request per list may write its answer. */
    async loadInto(target, filter, sort, append) {
        const seq = (this.#seqs.get(target) ?? 0) + 1;
        this.#seqs.set(target, seq);
        const previous = append ? this.state[target].rows : [];
        this.set((s) => ({ [target]: { ...s[target], loading: true, error: null, ...(append ? {} : { rows: [] }) } }));
        try {
            const page = await this.host.request('issues.list', {
                ...filter,
                sort: SORT_BY[sort.column] ?? 'updated',
                order: sort.direction,
                offset: previous.length
            });
            if (this.#seqs.get(target) === seq)
                this.set({ [target]: { rows: [...previous, ...page.issues], total: page.total, loading: false, error: null } });
        }
        catch (error) {
            if (this.#seqs.get(target) === seq)
                this.set((s) => ({ [target]: { ...s[target], loading: false, error: message(error) } }));
        }
    }
    loadDashboard(append = false) {
        const d = this.state.dashboard;
        void this.loadInto('dashList', dashFilter(d.who, d.due), d.sort, append);
        if (append)
            return;
        const counts = [
            ['assigned', dashFilter('assigned', 'all')],
            ['created', dashFilter('created', 'all')],
            ...DUE_TABS.map((t) => [t.value, dashFilter(d.who, t.value)])
        ];
        for (const [name, filter] of counts) {
            void this.host
                .request('issues.count', filter)
                .then(({ count }) => this.set((s) => ({ dashCounts: { ...s.dashCounts, [name]: count } })))
                .catch(() => undefined);
        }
    }
    setDashboard(part) {
        const recount = part.who !== undefined && part.who !== this.state.dashboard.who;
        this.set((s) => ({ dashboard: { ...s.dashboard, ...part } }));
        if (recount)
            this.loadDashboard();
        else {
            const d = this.state.dashboard;
            void this.loadInto('dashList', dashFilter(d.who, d.due), d.sort, false);
        }
    }
    loadIssues = (append = false) => this.loadInto('issueList', issueFilterOf(this.state.filters), this.state.filters.sort, append);
    async loadMeta() {
        try {
            this.set({ meta: await this.host.request('meta.get', picked('projectId', this.state.filters.projectId)) });
        }
        catch (error) {
            this.set((s) => ({ issueList: { ...s.issueList, error: message(error) } }));
        }
    }
    setFilter(part) {
        const projectChanged = part.projectId !== undefined && part.projectId !== this.state.filters.projectId;
        this.set((s) => ({ filters: { ...s.filters, ...(projectChanged ? { status: 'notClosed', ...PER_PROJECT, ...part } : part) } }));
        if (projectChanged)
            void this.loadMeta();
        void this.loadIssues();
    }
    typeKeyword(keyword) {
        this.set((s) => ({ filters: { ...s.filters, keyword } }));
        clearTimeout(this.#keywordTimer);
        this.#keywordTimer = setTimeout(() => void this.loadIssues(), 350);
    }
    openProject(projectId) {
        this.goTo('issues');
        this.setFilter({ projectId, keyword: '' });
    }
    // --- Columns -----------------------------------------------------------------------------------
    toggleColumn(table, defaults, column, on) {
        const now = columnsOf(this.state, table, defaults);
        const next = on ? [...now, column] : now.filter((c) => c !== column);
        this.set((s) => ({ columns: { ...s.columns, [table]: COLUMN_ORDER.filter((c) => next.includes(c)) } }));
    }
    setWidth(table, column, px) {
        const width = Math.max(MIN_WIDTH, Math.round(px));
        this.set((s) => ({ widths: { ...s.widths, [table]: { ...s.widths[table], [column]: width } } }));
    }
    resetColumns(table) {
        this.set((s) => {
            const { [table]: _c, ...columns } = s.columns;
            const { [table]: _w, ...widths } = s.widths;
            return { columns, widths };
        });
    }
    // --- Pull requests -----------------------------------------------------------------------------
    async checkConflicts(prs) {
        if (!Array.isArray(prs))
            return;
        const keys = prs.filter((pr) => pr.statusId === 1).map((pr) => pr.key);
        if (!keys.length)
            return;
        this.set((s) => ({ prChecks: { ...s.prChecks, ...Object.fromEntries(keys.map((k) => [k, 'checking'])) } }));
        for (const key of keys) {
            let check;
            try {
                const answer = await this.host.request('pullRequests.conflicts', { keys: [key] }, { timeoutMs: 120_000 });
                check = answer[key] ?? { state: 'unknown', reason: 'No answer for this pull request.' };
            }
            catch (error) {
                check = { state: 'unknown', reason: message(error) };
            }
            this.set((s) => ({ prChecks: { ...s.prChecks, [key]: check } }));
        }
    }
    async loadMyPrs() {
        const seq = ++this.#myPrsSeq;
        this.set((s) => ({ myPrs: { ...s.myPrs, loading: true, error: null } }));
        try {
            const prs = await this.host.request('pullRequests.mine', undefined, { timeoutMs: 120_000 });
            if (seq !== this.#myPrsSeq)
                return;
            this.set({ myPrs: { prs, loading: false, error: null } });
            void this.checkConflicts(prs);
        }
        catch (error) {
            if (seq === this.#myPrsSeq)
                this.set((s) => ({ myPrs: { ...s.myPrs, loading: false, error: message(error) } }));
        }
    }
    // --- Links -------------------------------------------------------------------------------------
    async openLink(place, url) {
        try {
            await this.host.openExternal(url);
        }
        catch (error) {
            this.say(place, 'danger', message(error));
        }
    }
    async linkAction(place, url, how) {
        try {
            if (how === 'browser') {
                const { opened } = await this.host.openExternal(url);
                if (!opened)
                    return;
            }
            else if (how === 'copy')
                await this.host.request('link.copy', { url });
            else
                await this.host.request('link.openInOrca', { url }, { timeoutMs: 60_000 });
            const done = { copy: 'Copied', browser: 'Opened in the browser', orca: "Opened in Orca's browser" }[how];
            this.say(place, 'success', `${done}: ${url}`);
        }
        catch (error) {
            this.say(place, 'danger', message(error));
        }
    }
    /** Copies any text (an issue key, a branch name, an answer). */
    async copyText(place, text, what = 'Copied') {
        try {
            await this.host.request('ai.copy', { text });
            this.say(place, 'success', `${what}.`);
        }
        catch (error) {
            this.say(place, 'danger', message(error));
        }
    }
    // --- Issue detail ------------------------------------------------------------------------------
    async openIssue(key) {
        this.set({ openKey: key, detail: { issue: null, error: null }, notice: null });
        try {
            const issue = await this.host.request('issue.get', { key }, { timeoutMs: 120_000 });
            if (this.state.openKey === key) {
                this.set({ detail: { issue, error: null } });
                this.startEditing(issue);
                void this.checkConflicts(issue.pullRequests);
            }
        }
        catch (error) {
            if (this.state.openKey === key)
                this.set({ detail: { issue: null, error: message(error) } });
        }
        void this.loadRuns(key);
        if (!this.state.launchOptions)
            await this.loadLaunchOptions();
        if (this.state.openKey === key)
            void this.refreshPrompt(key, true);
    }
    openFromList(key) {
        this.set({ trail: [] });
        void this.openIssue(key);
    }
    followIssue(key) {
        const from = this.state.openKey;
        if (from)
            this.set((s) => ({ trail: [...s.trail, from] }));
        void this.openIssue(key);
    }
    backFromIssue() {
        const t = this.state.trail;
        const previous = t[t.length - 1];
        if (!previous)
            return this.set({ openKey: null });
        this.set({ trail: t.slice(0, -1) });
        void this.openIssue(previous);
    }
    startEditing(issue) {
        const before = this.state.editing;
        if (before?.files.length)
            void this.host.request('files.drop', { ids: before.files.map((f) => f.id) }).catch(() => undefined);
        this.set({ editing: { key: issue.key, fields: issue.fields, comment: '', files: [] }, editingText: false });
        if (this.state.editMeta?.projectId !== issue.projectId)
            void this.loadEditMeta(issue.projectId);
    }
    async loadEditMeta(projectId) {
        this.set({ editMeta: null });
        try {
            this.set({ editMeta: { projectId, meta: await this.host.request('meta.get', { projectId: String(projectId) }) } });
        }
        catch (error) {
            this.say('fields', 'danger', `Cannot load the project's statuses and members: ${message(error)}`);
        }
    }
    editFields(part) {
        const form = this.state.editing;
        if (form)
            this.set({ editing: { ...form, fields: { ...form.fields, ...part } } });
    }
    editComment(comment) {
        const form = this.state.editing;
        if (form)
            this.set({ editing: { ...form, comment } });
    }
    cancelText(issue) {
        const form = this.state.editing;
        if (form?.key === issue.key) {
            this.set({ editing: { ...form, fields: { ...form.fields, summary: issue.fields.summary, description: issue.fields.description } } });
        }
        this.set({ editingText: false });
    }
    async discardFields(issue) {
        if (!(await this.dialogs.confirm({ title: 'Discard the comment and changes?', message: 'What you typed and changed here is lost.', yes: 'Discard', danger: true })))
            return;
        const form = this.state.editing;
        if (form?.key !== issue.key)
            return;
        if (form.files.length)
            void this.host.request('files.drop', { ids: form.files.map((f) => f.id) }).catch(() => undefined);
        this.set({ editing: { key: issue.key, fields: { ...issue.fields, summary: form.fields.summary, description: form.fields.description }, comment: '', files: [] } });
    }
    async saveIssue(issue, part) {
        const form = this.state.editing;
        if (!form || form.key !== issue.key || this.state.saving)
            return;
        const changes = changesOf(issue.fields, form, part);
        if (!Object.keys(changes).length)
            return;
        this.set({ saving: true });
        try {
            const next = await this.host.request('issue.update', { key: issue.key, changes }, { timeoutMs: 120_000 });
            if (this.state.openKey !== issue.key)
                return;
            // The other part's edits are not saved yet: keep them over what Backlog answered.
            const kept = Object.fromEntries(Object.keys(form.fields)
                .filter((name) => !inPart(part, name) && !sameValue(form.fields[name], issue.fields[name]))
                .map((name) => [name, form.fields[name]]));
            this.set({
                detail: { issue: next, error: null },
                editing: {
                    key: next.key,
                    fields: { ...next.fields, ...kept },
                    comment: part === 'fields' ? '' : form.comment,
                    files: part === 'fields' ? [] : form.files
                },
                ...(part === 'text' ? { editingText: false } : {})
            });
            const fields = Object.keys(changes).filter((c) => c !== 'comment' && c !== 'files').length;
            const attached = changes.files?.length ?? 0;
            const parts = [
                fields ? `Saved ${fields} field${fields > 1 ? 's' : ''}` : null,
                changes.comment || attached ? 'comment added' : null,
                attached ? `${attached} file${attached > 1 ? 's' : ''} attached` : null
            ];
            this.say(part === 'text' ? 'header' : 'fields', 'success', `${parts.filter(Boolean).join(', ')}.`);
        }
        catch (error) {
            this.say(part === 'text' ? 'header' : 'fields', 'danger', message(error));
        }
        finally {
            this.set({ saving: false });
        }
    }
    /** Files for the comment chosen in the OS's open dialog (pasted and dropped ones: `putFiles`). */
    async addFiles(issue) {
        if (this.state.picking)
            return;
        this.set({ picking: true });
        try {
            const got = { files: await this.host.request('files.choose', undefined, { timeoutMs: 120_000 }) };
            const form = this.state.editing;
            if (!form || form.key !== issue.key) {
                if (got.files.length)
                    void this.host.request('files.drop', { ids: got.files.map((f) => f.id) }).catch(() => undefined);
                return;
            }
            if (got.message)
                this.say('fields', 'warning', got.message);
            if (got.files.length)
                this.set({ editing: { ...form, files: [...form.files, ...got.files] } });
        }
        catch (error) {
            this.say('fields', 'danger', message(error));
        }
        finally {
            this.set({ picking: false });
        }
    }
    /** Files the panel already has (pasted into the comment, or dropped on it), as base64. */
    async putFiles(issue, files) {
        for (const file of files) {
            try {
                const pending = await this.host.request('files.put', file, { timeoutMs: 60_000 });
                const form = this.state.editing;
                if (!form || form.key !== issue.key) {
                    void this.host.request('files.drop', { ids: [pending.id] }).catch(() => undefined);
                    return;
                }
                this.set({ editing: { ...form, files: [...form.files, pending] } });
            }
            catch (error) {
                this.say('fields', 'danger', `${file.name}: ${message(error)}`);
            }
        }
    }
    async removeFile(issue, id) {
        const file = this.state.editing?.files.find((f) => f.id === id);
        if (!(await this.dialogs.confirm({ title: 'Remove this file from the comment?', message: file?.name, yes: 'Remove', danger: true })))
            return;
        const form = this.state.editing;
        if (!form || form.key !== issue.key)
            return;
        this.set({ editing: { ...form, files: form.files.filter((f) => f.id !== id) } });
        void this.host.request('files.drop', { ids: [id] }).catch(() => undefined);
    }
    /** Inline images, fetched once each through the worker (the frame has no network). */
    #images = new Map();
    /** A `data:` URL for an image attachment; fails for non-images and very large ones. */
    imageUrl(key, attachmentId) {
        const id = `${key}#${attachmentId}`;
        let url = this.#images.get(id);
        if (!url) {
            url = this.host
                .request('attachment.data', { key, attachmentId }, { timeoutMs: 60_000 })
                .then(({ mime, data }) => `data:${mime};base64,${data}`);
            // A failure may be passing (a timeout): let the next view try again.
            url.catch(() => this.#images.delete(id));
            this.#images.set(id, url);
            // Keep the cache bounded: the oldest images go first.
            if (this.#images.size > 60)
                this.#images.delete(this.#images.keys().next().value);
        }
        return url;
    }
    async openAttachment(key, attachmentId, place = 'attachments') {
        this.say(place, 'neutral', 'Downloading…');
        try {
            const result = await this.host.request('attachment.open', { key, attachmentId }, { timeoutMs: 120_000 });
            const how = { preview: 'Opened in Orca', folder: 'Saved and opened its folder', external: 'Opened with the system viewer' };
            this.say(place, 'success', `${how[result.mode]}: ${result.path}`);
        }
        catch (error) {
            this.say(place, 'danger', message(error));
        }
    }
    // --- Worktrees and agents ----------------------------------------------------------------------
    async loadRuns(key) {
        try {
            const runs = await this.host.request('runs.get', { key });
            if (this.state.openKey === key)
                this.set({ issueRuns: { key, runs } });
        }
        catch (error) {
            this.say('worktrees', 'danger', `Cannot list the issue's worktrees: ${message(error)}`);
        }
    }
    async focusRun(workspaceId) {
        try {
            await this.host.request('runs.focus', { workspaceId });
        }
        catch (error) {
            this.say('worktrees', 'danger', message(error));
        }
    }
    async linkRun(key, workspaceId, how) {
        if (how === 'unlink') {
            const run = this.state.issueRuns?.runs.find((r) => r.workspaceId === workspaceId);
            const ok = await this.dialogs.confirm({
                title: `Unlink this worktree from ${key}?`,
                message: run ? `${run.label}: the worktree itself stays.` : 'The worktree itself stays.',
                yes: 'Unlink',
                danger: true
            });
            if (!ok)
                return;
        }
        try {
            const runs = await this.host.request(how === 'link' ? 'runs.link' : 'runs.unlink', { key, workspaceId });
            if (this.state.openKey === key)
                this.set({ issueRuns: { key, runs } });
        }
        catch (error) {
            this.say('worktrees', 'danger', message(error));
        }
    }
    async loadLaunchOptions() {
        try {
            const options = await this.host.request('launch.options', undefined, { timeoutMs: 60_000 });
            const c = this.state.choice;
            const has = (list, value) => list.some((o) => o.value === value);
            this.set({
                launchOptions: options,
                choice: {
                    ...c,
                    target: has(options.targets, c.target) ? c.target : (options.focused ?? options.targets[0]?.value ?? ''),
                    agent: has(options.agents, c.agent) ? c.agent : (options.defaultAgent ?? '')
                }
            });
        }
        catch (error) {
            this.say('launch', 'danger', `Cannot list agents and skills: ${message(error)}`);
        }
    }
    /** Fills the prompt for the current choice; a prompt the person edited stays unless `reset`. */
    async refreshPrompt(key, reset = false) {
        const { agent, skill } = this.state.choice;
        const basis = `${key}|${agent}|${skill}`;
        const draft = this.state.promptDraft;
        if (!agent || (!reset && draft?.edited && draft.basis.startsWith(`${key}|`)))
            return;
        this.set({ promptDraft: { basis, text: '', edited: false } });
        try {
            const { prompt } = await this.host.request('launch.prompt', { key, agent, ...(skill ? { skill } : {}) });
            if (this.state.promptDraft?.basis === basis)
                this.set({ promptDraft: { basis, text: prompt, edited: false } });
        }
        catch (error) {
            this.say('launch', 'danger', `Cannot write the prompt: ${message(error)}`);
        }
    }
    choose(key, part) {
        this.set((s) => ({ choice: { ...s.choice, ...part } }));
        if (part.agent !== undefined || part.skill !== undefined)
            void this.refreshPrompt(key);
    }
    async startAgent(key) {
        const { target, agent, skill } = this.state.choice;
        const prompt = this.state.promptDraft?.text.trim();
        this.set({ launching: true });
        this.say('launch', 'neutral', 'Starting the agent…');
        try {
            await this.host.request('launch.start', { key, target, agent, ...(skill ? { skill } : {}), ...(prompt ? { prompt } : {}) }, { timeoutMs: 120_000 });
            void this.loadRuns(key);
            const label = this.state.launchOptions?.agents.find((a) => a.value === agent)?.label ?? agent;
            this.say('launch', 'success', `${label} started on ${key}${skill ? ` with ${skill}` : ''}.`);
        }
        catch (error) {
            this.say('launch', 'danger', message(error));
        }
        finally {
            this.set({ launching: false });
        }
    }
    // --- Quick assign ------------------------------------------------------------------------------
    /** After an assignment: the lists and the open issue show it. */
    #afterAssign(key) {
        const { screen, openKey } = this.state;
        if (openKey && (!key || openKey === key))
            void this.openIssue(openKey);
        if (screen === 'home') {
            this.loadDashboard();
            void this.loadMyPrs();
        }
        else if (screen === 'issues')
            void this.loadIssues();
    }
    /**
     * Assigns an issue to a member, then offers to assign its open pull requests to them too (a
     * second question, since a pull request may rightly stay with someone else).
     */
    async assignIssue(issue, place = 'header') {
        if (!issue.projectId)
            return this.say(place, 'danger', 'Open the issue to assign it.');
        const pick = await this.dialogs.pickMember({ title: `Assign ${issue.key} to`, projectId: issue.projectId, current: issue.assigneeId ?? null });
        if (!pick)
            return;
        let next;
        try {
            next = await this.host.request('issue.update', { key: issue.key, changes: { assigneeId: pick.id === null ? '' : String(pick.id) } }, { timeoutMs: 120_000 });
        }
        catch (error) {
            return this.say(place, 'danger', message(error));
        }
        this.say(place, 'success', pick.id === null ? `${issue.key} is unassigned.` : `Assigned ${issue.key} to ${pick.name}.`);
        const prs = (next.pullRequests ?? []).filter((pr) => pr.statusId === 1 && (pr.assigneeId ?? null) !== pick.id);
        if (prs.length) {
            const yes = await this.dialogs.confirm({
                title: prs.length === 1 ? 'Assign its pull request too?' : `Assign its ${prs.length} open pull requests too?`,
                message: `${prs.map((pr) => `#${pr.number} ${pr.summary} (${pr.repo})`).join('\n')}\n→ ${pick.id === null ? 'nobody' : pick.name}`,
                yes: 'Yes, assign',
                no: 'No'
            });
            if (yes)
                await this.#assignPrs(prs, pick, place);
        }
        this.#afterAssign(issue.key);
    }
    async #assignPrs(prs, pick, place) {
        for (const pr of prs) {
            try {
                await this.host.request('pullRequest.assign', { key: pr.key, assigneeId: pick.id });
            }
            catch (error) {
                return this.say(place, 'danger', `#${pr.number}: ${message(error)}`);
            }
        }
        this.say(place, 'success', `Assigned ${prs.length === 1 ? `#${prs[0].number}` : `${prs.length} pull requests`} to ${pick.id === null ? 'nobody' : pick.name} too.`);
    }
    /** Assigns a pull request to a member, then offers to assign the issue it links too. */
    async assignPullRequest(pr, place = 'pullRequests') {
        if (!pr.projectId)
            return this.say(place, 'danger', 'Reload the list to assign this pull request.');
        const pick = await this.dialogs.pickMember({ title: `Assign #${pr.number} to`, projectId: pr.projectId, current: pr.assigneeId ?? null });
        if (!pick)
            return;
        try {
            await this.host.request('pullRequest.assign', { key: pr.key, assigneeId: pick.id });
        }
        catch (error) {
            return this.say(place, 'danger', message(error));
        }
        this.say(place, 'success', `Assigned #${pr.number} to ${pick.id === null ? 'nobody' : pick.name}.`);
        const issueKey = pr.issueKey ?? (this.state.detail.issue?.pullRequests.some((p) => p.key === pr.key) ? this.state.detail.issue.key : null);
        if (issueKey) {
            const yes = await this.dialogs.confirm({
                title: `Assign ${issueKey} too?`,
                message: `The issue this pull request links → ${pick.id === null ? 'nobody' : pick.name}`,
                yes: 'Yes, assign',
                no: 'No'
            });
            if (yes) {
                try {
                    await this.host.request('issue.update', { key: issueKey, changes: { assigneeId: pick.id === null ? '' : String(pick.id) } }, { timeoutMs: 120_000 });
                    this.say(place, 'success', `Assigned #${pr.number} and ${issueKey} to ${pick.id === null ? 'nobody' : pick.name}.`);
                }
                catch (error) {
                    this.say(place, 'danger', `${issueKey}: ${message(error)}`);
                }
            }
        }
        this.#afterAssign(issueKey ?? undefined);
    }
    // --- Settings ----------------------------------------------------------------------------------
    /** Settings, with `section` (a Section id) open. */
    openSettings(section) {
        if (section)
            this.set((s) => ({ closedSections: s.closedSections.filter((id) => id !== section), focusSection: section }));
        this.goTo('settings');
        void this.loadSettings();
    }
    async loadSettings() {
        void this.loadConnection();
        void this.loadAudit();
        void this.loadFound();
        try {
            this.set({ settings: await this.host.request('settings.get') });
        }
        catch (error) {
            this.set({ authError: message(error) });
        }
    }
    async loadAudit() {
        this.set({ confirmClear: false });
        try {
            this.set({ audit: await this.host.request('audit.list') });
        }
        catch (error) {
            this.set({ audit: [], authError: message(error) });
        }
    }
    async clearAudit() {
        const ok = await this.dialogs.confirm({ title: 'Clear the audit log?', message: 'Every entry on this computer is deleted.', yes: 'Clear', danger: true });
        if (!ok)
            return;
        this.set({ confirmClear: false, audit: await this.host.request('audit.clear') });
    }
    async loadConnection() {
        try {
            this.set({ connection: await this.host.request('connection.get') });
        }
        catch (error) {
            this.set({ connectionTest: { tone: 'danger', text: message(error) } });
        }
    }
    async setConnection(part) {
        const now = this.state.connection;
        if (!now)
            return;
        this.set({ connectionTest: null });
        try {
            this.set({ connection: await this.host.request('connection.set', { system: now.system, caFile: now.caFile, ...part }) });
        }
        catch (error) {
            this.set({ connectionTest: { tone: 'danger', text: message(error) } });
        }
    }
    async testConnection() {
        this.set({ connectionTest: { tone: 'neutral', text: 'Testing…' } });
        try {
            const { ok, message: text } = await this.host.request('connection.test');
            this.set({ connectionTest: { tone: ok ? 'success' : 'danger', text } });
        }
        catch (error) {
            this.set({ connectionTest: { tone: 'danger', text: message(error) } });
        }
    }
    async mapProject(projectId, accountId) {
        this.set({ settings: await this.host.request('settings.map', { projectId, accountId }) });
    }
    // --- Backlog AI --------------------------------------------------------------------------------
    async loadAiStatus(recheck = false) {
        try {
            this.set({ aiStatus: (await this.host.request('ai.status', { recheck }, { timeoutMs: 60_000 })).state });
        }
        catch {
            this.set({ aiStatus: 'unknown' });
        }
    }
    openAi() {
        this.goTo('ai');
        void this.loadAiHistory();
    }
    newAiChat() {
        this.set({ aiChat: { threadId: null, title: null, turns: [] }, aiShowHistory: false });
    }
    async loadAiHistory() {
        try {
            const history = await this.host.request('ai.history', undefined, { timeoutMs: 60_000 });
            const chat = this.state.aiChat;
            const title = history.threads.find((t) => t.id === chat.threadId)?.title;
            this.set({ aiHistory: history, ...(title && title !== chat.title ? { aiChat: { ...chat, title } } : {}) });
        }
        catch (error) {
            this.say('ai', 'danger', message(error));
        }
    }
    async openAiThread(thread) {
        if (this.state.aiAsking)
            return;
        this.set({ aiShowHistory: false, aiLoading: thread.id });
        try {
            const { turns, more } = await this.host.request('ai.thread', { threadId: thread.id }, { timeoutMs: 60_000 });
            this.set({ aiChat: { threadId: thread.id, title: thread.title, turns, more } });
        }
        catch (error) {
            this.say('ai', 'danger', message(error));
        }
        finally {
            this.set({ aiLoading: null });
        }
    }
    async askAi() {
        const question = this.state.aiDraft.trim();
        if (!question || this.state.aiAsking)
            return;
        const { threadId } = this.state.aiChat;
        this.set({ aiAsking: question, aiDraft: '' });
        try {
            const answer = await this.host.request('ai.ask', { question, threadId }, { timeoutMs: 120_000 });
            const chat = this.state.aiChat;
            this.set({ aiChat: { ...chat, threadId: answer.threadId ?? chat.threadId, turns: [...chat.turns, { question, answer }] } });
            // Backlog names a new chat a few seconds after its first answer.
            if (!chat.threadId)
                setTimeout(() => void this.loadAiHistory(), 4000);
            else
                void this.loadAiHistory();
        }
        catch (error) {
            if (!this.state.aiDraft)
                this.set({ aiDraft: question });
            this.say('ai', 'danger', message(error));
        }
        finally {
            this.set({ aiAsking: null });
        }
    }
    /** A new chat that starts with `question` (Summarize on an issue). */
    askAiAbout(question) {
        this.goTo('ai');
        this.newAiChat();
        this.set({ aiDraft: question });
        void this.askAi();
        void this.loadAiHistory();
    }
    async openAiOnWeb() {
        try {
            await this.host.request('ai.open', { threadId: this.state.aiChat.threadId }, { timeoutMs: 60_000 });
        }
        catch (error) {
            this.say('ai', 'danger', message(error));
        }
    }
}
