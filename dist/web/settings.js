// Signing in, and Settings: accounts, adding one, the connection's certificates, the audit log
// and which account each Orca project uses.
import { h } from './vendor/preact.js';
import { useState } from './vendor/hooks.js';
import { ago } from './app.js';
import { Icon } from './icons.js';
import { TopBar } from './screens.js';
import { Badge, Button, Callout, Checkbox, cx, Empty, IconButton, Input, openMenu, Section, Select, Spinner, useApp } from './ui.js';
function FoundCredentials() {
    const [s, app] = useApp();
    const list = s.found;
    return (h("div", { class: "stack" },
        h("div", { class: "row between" },
            h("span", { class: "label-strong" }, "Found on this computer"),
            h(IconButton, { icon: "refresh", label: "Scan again", disabled: !list, onClick: () => void app.loadFound() })),
        !list ? (h(Spinner, { label: "Looking for backlog-mcp-server configs" })) : list.length ? (h("div", { class: "link-list" }, list.map((c) => (h("div", { key: c.id, class: "link-row" },
            h("button", { type: "button", class: "link-main", onClick: () => void app.useFound(c.id) },
                h(Icon, { name: c.error ? 'warning' : 'link' }),
                h("span", { class: "link-text" },
                    h("span", { class: "link-title" }, c.saved ? `${c.space} · saved` : c.space),
                    h("span", { class: "link-sub" },
                        c.file,
                        " \u00B7 key ",
                        c.keyHint,
                        c.error ? ` · ${c.error}` : '')))))))) : (h(Empty, { icon: "search" }, "No BACKLOG_DOMAIN / BACKLOG_API_KEY in Claude, Cursor, Windsurf, Gemini, Codex or VS Code MCP configs, nor in this workspace's .mcp.json."))));
}
function AccountForm() {
    const [s, app] = useApp();
    const f = s.form;
    return (h("form", { class: "stack", onSubmit: (e) => {
            e.preventDefault();
            void app.login();
        } },
        h(FoundCredentials, null),
        h("hr", { class: "sep" }),
        h(Input, { label: "Space", placeholder: "your-space.backlog.com", value: f.space, onInput: (space) => app.set({ form: { ...f, space } }) }),
        h(Input, { label: "API key", type: "password", value: f.apiKey, onInput: (apiKey) => app.set({ form: { ...f, apiKey } }), onEnter: () => void app.login() }),
        s.authError ? h(Callout, { tone: "danger", title: "Sign-in failed" }, s.authError) : null,
        h(Button, { type: "submit", variant: "primary", icon: "link", disabled: !f.space.trim() || !f.apiKey.trim() }, "Connect")));
}
export function LoginView() {
    return (h("div", { class: "screen" },
        h("div", { class: "screen-body login" },
            h("div", { class: "login-card" },
                h("span", { class: "brand-mark big", "aria-hidden": "true" }),
                h("h1", null, "Connect to Backlog"),
                h("p", { class: "muted" }, "Sign in with a personal API key (Backlog \u2192 Personal settings \u2192 API)."),
                h(AccountForm, null)))));
}
function ConnectionSettings() {
    const [s, app] = useApp();
    const [draft, setDraft] = useState(null);
    const c = s.connection;
    if (!c)
        return h(Spinner, { label: "Loading connection settings" });
    const caFile = draft ?? c.caFile;
    const edited = caFile.trim() !== c.caFile;
    const total = c.node + c.systemCount + c.fileCount;
    const apply = () => void app.setConnection({ caFile }).then(() => setDraft(null));
    return (h("div", { class: "stack" },
        h("div", { class: "muted small" }, "Behind a company proxy or antivirus that inspects HTTPS, Backlog fails with SELF_SIGNED_CERT_IN_CHAIN until its root certificate is trusted here."),
        h(Checkbox, { label: "Trust the system's certificates", hint: "The certificate store of Windows, macOS or Linux, where IT usually installs it.", checked: c.system, onChange: (system) => void app.setConnection({ system }) }),
        h(Input, { label: "Extra CA certificate file (PEM)", placeholder: "C:\\certs\\company-root.pem", value: caFile, onInput: setDraft, onEnter: apply }),
        h("dl", { class: "props compact" },
            h("div", { class: "prop" },
                h("dt", null, "Node"),
                h("dd", null, c.node)),
            h("div", { class: "prop" },
                h("dt", null, "System"),
                h("dd", null, c.system ? c.systemCount : 'off')),
            h("div", { class: "prop" },
                h("dt", null, "File"),
                h("dd", null, c.caFile ? c.fileCount : 'none')),
            h("div", { class: "prop" },
                h("dt", null, "Trusted"),
                h("dd", null,
                    total,
                    " certificates"))),
        c.error ? h(Callout, { tone: "danger", title: "Certificates" }, c.error) : null,
        s.connectionTest ? h(Callout, { tone: s.connectionTest.tone }, s.connectionTest.text) : null,
        h("div", { class: "row" },
            edited ? (h(Button, { variant: "primary", icon: "check", onClick: apply }, "Apply")) : null,
            h(Button, { icon: "refresh", onClick: () => void app.testConnection() }, "Test connection"))));
}
function AuditLog() {
    const [s, app] = useApp();
    const entries = s.audit;
    const failed = entries?.filter((e) => !e.ok).length ?? 0;
    return (h("div", { class: "stack" },
        h("div", { class: "row between" },
            h("span", { class: "muted small" }, entries ? `${entries.length} change${entries.length === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}; the newest 500 are kept on this computer.` : ''),
            h("div", { class: "row" },
                h(IconButton, { icon: "refresh", label: "Reload audit log", onClick: () => void app.loadAudit() }),
                h(Button, { size: "sm", variant: s.confirmClear ? 'danger' : 'ghost', disabled: !entries?.length, onClick: () => void app.clearAudit() }, s.confirmClear ? 'Press again to clear' : 'Clear'))),
        !entries ? (h(Spinner, { label: "Loading the audit log" })) : entries.length ? (h("ol", { class: "audit" }, entries.map((e) => (h("li", { key: e.id, class: cx('audit-entry', !e.ok && 'is-failed'), onContextMenu: (ev) => openMenu(ev, [
                { label: 'Copy entry', icon: 'copy', onSelect: () => void app.copyText('settings', [new Date(e.at).toISOString(), e.action, e.target, e.api, e.details, e.ok ? 'OK' : `Failed: ${e.error}`].filter(Boolean).join(' | '), 'Copied the entry') }
            ]) },
            h("div", { class: "row between" },
                h("span", { class: "label-strong" },
                    e.action,
                    e.target ? h("span", { class: "muted" },
                        " \u00B7 ",
                        e.target) : null),
                h("span", { class: "muted small", title: new Date(e.at).toLocaleString() }, ago(e.at))),
            h("div", { class: "mono small" }, e.api),
            e.details ? h("div", { class: "small" }, e.details) : null,
            e.ok ? null : h("div", { class: "small tone-text-danger" },
                "Failed: ",
                e.error),
            e.space ? h("div", { class: "muted small" }, e.space) : null))))) : (h(Empty, { icon: "history" }, "Nothing changed yet."))));
}
const LAST_USED = 'lastUsed';
export function SettingsView() {
    const [s, app] = useApp();
    const inUse = s.session?.accountId;
    const options = s.accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.space}` }));
    return (h("div", { class: "screen" },
        h(TopBar, { title: "Settings", back: () => app.goHome() }),
        h("div", { class: "screen-body" },
            h(Section, { id: "settings.accounts", title: "Accounts", count: s.accounts.length },
                s.accounts.length ? null : h(Empty, { icon: "user" }, "No accounts yet: add one below."),
                h("div", { class: "link-list" }, s.accounts.map((a) => (h("div", { key: a.id, class: "link-row" },
                    h("button", { type: "button", class: "link-main", disabled: a.id === inUse, onClick: () => void app.useAccount(a.id), title: a.id === inUse ? 'In use' : 'Use this account' },
                        h(Icon, { name: "user" }),
                        h("span", { class: "link-text" },
                            h("span", { class: "link-title" },
                                a.name,
                                " ",
                                a.id === inUse ? h(Badge, { tone: "accent" }, "In use") : null),
                            h("span", { class: "link-sub" }, a.space))),
                    h(IconButton, { icon: "trash", label: `Remove ${a.name} · ${a.space}`, tone: "danger", onClick: () => void app.removeAccount(a.id) })))))),
            h(Section, { id: "settings.add", title: "Add account" },
                h(AccountForm, null)),
            h(Section, { id: "settings.connection", title: "Connection" },
                h(ConnectionSettings, null)),
            h(Section, { id: "settings.audit", title: "Audit log" },
                h(AuditLog, null)),
            h(Section, { id: "settings.projects", title: "Account per Orca project" },
                h("div", { class: "muted small" }, "Switching account at the top also remembers it for the Orca project in focus."),
                !s.settings ? (h(Spinner, { label: "Loading projects" })) : !s.settings.projects.length ? (h(Empty, { icon: "folder" }, "No Orca projects yet.")) : (h("div", { class: "stack" }, s.settings.projects.map((proj) => (h(Select, { key: proj.value, label: proj.label, value: proj.accountId || LAST_USED, options: [{ value: LAST_USED, label: 'Last used account' }, ...options], onChange: (id) => void app.mapProject(proj.value, id === LAST_USED ? '' : id) })))))))));
}
