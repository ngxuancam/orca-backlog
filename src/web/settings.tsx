// Signing in, and Settings: accounts, adding one, the connection's certificates, the audit log
// and which account each Orca project uses.
import { h } from './vendor/preact.js'
import { useState } from './vendor/hooks.js'
import { ago } from './app.js'
import { Icon } from './icons.js'
import { TopBar } from './screens.js'
import { Badge, Button, Callout, Checkbox, cx, Empty, IconButton, Input, openMenu, Section, Select, Spinner, useApp } from './ui.js'

function FoundCredentials() {
  const [s, app] = useApp()
  const list = s.found
  return (
    <div class="stack">
      <div class="row between">
        <span class="label-strong">Found on this computer</span>
        <IconButton icon="refresh" label="Scan again" disabled={!list} onClick={() => void app.loadFound()} />
      </div>
      {!list ? (
        <Spinner label="Looking for backlog-mcp-server configs" />
      ) : list.length ? (
        <div class="link-list">
          {list.map((c) => (
            <div key={c.id} class="link-row">
              <button type="button" class="link-main" onClick={() => void app.useFound(c.id)}>
                <Icon name={c.error ? 'warning' : 'link'} />
                <span class="link-text">
                  <span class="link-title">{c.saved ? `${c.space} · saved` : c.space}</span>
                  <span class="link-sub">
                    {c.file} · key {c.keyHint}
                    {c.error ? ` · ${c.error}` : ''}
                  </span>
                </span>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon="search">No BACKLOG_DOMAIN / BACKLOG_API_KEY in Claude, Cursor, Windsurf, Gemini, Codex or VS Code MCP configs, nor in this workspace's .mcp.json.</Empty>
      )}
    </div>
  )
}

function AccountForm() {
  const [s, app] = useApp()
  const f = s.form
  return (
    <form
      class="stack"
      onSubmit={(e) => {
        e.preventDefault()
        void app.login()
      }}
    >
      <FoundCredentials />
      <hr class="sep" />
      <Input label="Space" placeholder="your-space.backlog.com" value={f.space} onInput={(space) => app.set({ form: { ...f, space } })} />
      <Input label="API key" type="password" value={f.apiKey} onInput={(apiKey) => app.set({ form: { ...f, apiKey } })} onEnter={() => void app.login()} />
      {s.authError ? <Callout tone="danger" title="Sign-in failed">{s.authError}</Callout> : null}
      <Button type="submit" variant="primary" icon="link" disabled={!f.space.trim() || !f.apiKey.trim()}>
        Connect
      </Button>
    </form>
  )
}

export function LoginView() {
  return (
    <div class="screen">
      <div class="screen-body login">
        <div class="login-card">
          <span class="brand-mark big" aria-hidden="true" />
          <h1>Connect to Backlog</h1>
          <p class="muted">Sign in with a personal API key (Backlog → Personal settings → API).</p>
          <AccountForm />
        </div>
      </div>
    </div>
  )
}

function ConnectionSettings() {
  const [s, app] = useApp()
  const [draft, setDraft] = useState<string | null>(null)
  const c = s.connection
  if (!c) return <Spinner label="Loading connection settings" />
  const caFile = draft ?? c.caFile
  const edited = caFile.trim() !== c.caFile
  const total = c.node + c.systemCount + c.fileCount
  const apply = () => void app.setConnection({ caFile }).then(() => setDraft(null))
  return (
    <div class="stack">
      <div class="muted small">Behind a company proxy or antivirus that inspects HTTPS, Backlog fails with SELF_SIGNED_CERT_IN_CHAIN until its root certificate is trusted here.</div>
      <Checkbox label="Trust the system's certificates" hint="The certificate store of Windows, macOS or Linux, where IT usually installs it." checked={c.system} onChange={(system) => void app.setConnection({ system })} />
      <Input label="Extra CA certificate file (PEM)" placeholder="C:\certs\company-root.pem" value={caFile} onInput={setDraft} onEnter={apply} />
      <dl class="props compact">
        <div class="prop">
          <dt>Node</dt>
          <dd>{c.node}</dd>
        </div>
        <div class="prop">
          <dt>System</dt>
          <dd>{c.system ? c.systemCount : 'off'}</dd>
        </div>
        <div class="prop">
          <dt>File</dt>
          <dd>{c.caFile ? c.fileCount : 'none'}</dd>
        </div>
        <div class="prop">
          <dt>Trusted</dt>
          <dd>{total} certificates</dd>
        </div>
      </dl>
      {c.error ? <Callout tone="danger" title="Certificates">{c.error}</Callout> : null}
      {s.connectionTest ? <Callout tone={s.connectionTest.tone}>{s.connectionTest.text}</Callout> : null}
      <div class="row">
        {edited ? (
          <Button variant="primary" icon="check" onClick={apply}>
            Apply
          </Button>
        ) : null}
        <Button icon="refresh" onClick={() => void app.testConnection()}>
          Test connection
        </Button>
      </div>
    </div>
  )
}

function AuditLog() {
  const [s, app] = useApp()
  const entries = s.audit
  const failed = entries?.filter((e) => !e.ok).length ?? 0
  return (
    <div class="stack">
      <div class="row between">
        <span class="muted small">{entries ? `${entries.length} change${entries.length === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}; the newest 500 are kept on this computer.` : ''}</span>
        <div class="row">
          <IconButton icon="refresh" label="Reload audit log" onClick={() => void app.loadAudit()} />
          <Button size="sm" variant={s.confirmClear ? 'danger' : 'ghost'} disabled={!entries?.length} onClick={() => void app.clearAudit()}>
            {s.confirmClear ? 'Press again to clear' : 'Clear'}
          </Button>
        </div>
      </div>
      {!entries ? (
        <Spinner label="Loading the audit log" />
      ) : entries.length ? (
        <ol class="audit">
          {entries.map((e) => (
            <li
              key={e.id}
              class={cx('audit-entry', !e.ok && 'is-failed')}
              onContextMenu={(ev) =>
                openMenu(ev as unknown as MouseEvent, [
                  { label: 'Copy entry', icon: 'copy', onSelect: () => void app.copyText('settings', [new Date(e.at).toISOString(), e.action, e.target, e.api, e.details, e.ok ? 'OK' : `Failed: ${e.error}`].filter(Boolean).join(' | '), 'Copied the entry') }
                ])
              }
            >
              <div class="row between">
                <span class="label-strong">
                  {e.action}
                  {e.target ? <span class="muted"> · {e.target}</span> : null}
                </span>
                <span class="muted small" title={new Date(e.at).toLocaleString()}>
                  {ago(e.at)}
                </span>
              </div>
              <div class="mono small">{e.api}</div>
              {e.details ? <div class="small">{e.details}</div> : null}
              {e.ok ? null : <div class="small tone-text-danger">Failed: {e.error}</div>}
              {e.space ? <div class="muted small">{e.space}</div> : null}
            </li>
          ))}
        </ol>
      ) : (
        <Empty icon="history">Nothing changed yet.</Empty>
      )}
    </div>
  )
}

const LAST_USED = 'lastUsed'

export function SettingsView() {
  const [s, app] = useApp()
  const inUse = s.session?.accountId
  const options = s.accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.space}` }))
  return (
    <div class="screen">
      <TopBar title="Settings" back={() => app.goHome()} />
      <div class="screen-body">
        <Section id="settings.accounts" title="Accounts" count={s.accounts.length}>
          {s.accounts.length ? null : <Empty icon="user">No accounts yet: add one below.</Empty>}
          <div class="link-list">
            {s.accounts.map((a) => (
              <div key={a.id} class="link-row">
                <button type="button" class="link-main" disabled={a.id === inUse} onClick={() => void app.useAccount(a.id)} title={a.id === inUse ? 'In use' : 'Use this account'}>
                  <Icon name="user" />
                  <span class="link-text">
                    <span class="link-title">
                      {a.name} {a.id === inUse ? <Badge tone="accent">In use</Badge> : null}
                    </span>
                    <span class="link-sub">{a.space}</span>
                  </span>
                </button>
                <IconButton icon="trash" label={`Remove ${a.name} · ${a.space}`} tone="danger" onClick={() => void app.removeAccount(a.id)} />
              </div>
            ))}
          </div>
        </Section>
        <Section id="settings.add" title="Add account">
          <AccountForm />
        </Section>
        <Section id="settings.connection" title="Connection">
          <ConnectionSettings />
        </Section>
        <Section id="settings.audit" title="Audit log">
          <AuditLog />
        </Section>
        <Section id="settings.projects" title="Account per Orca project">
          <div class="muted small">Switching account at the top also remembers it for the Orca project in focus.</div>
          {!s.settings ? (
            <Spinner label="Loading projects" />
          ) : !s.settings.projects.length ? (
            <Empty icon="folder">No Orca projects yet.</Empty>
          ) : (
            <div class="stack">
              {s.settings.projects.map((proj) => (
                <Select
                  key={proj.value}
                  label={proj.label}
                  value={proj.accountId || LAST_USED}
                  options={[{ value: LAST_USED, label: 'Last used account' }, ...options]}
                  onChange={(id) => void app.mapProject(proj.value, id === LAST_USED ? '' : id)}
                />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}
