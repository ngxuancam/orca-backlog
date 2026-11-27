// The Backlog panel as a web page (Orca's HTML panel). Built by `npm run build:web` into dist/web;
// src/worker.ts answers its requests.
import { h, render } from './vendor/preact.js'
import { useEffect } from './vendor/hooks.js'
import type { AuthState } from '../protocol.js'
import { AiView } from './ai.js'
import { App, type Host } from './app.js'
import { DetailView } from './detail.js'
import { HomeView, IssuesView } from './screens.js'
import { LoginView, SettingsView } from './settings.js'
import { AppContext, DialogLayer, MenuLayer, Spinner, uiDialogs, useApp } from './ui.js'

const host: Host = {
  request: (name, input, options) => (orca.plugin.request as (n: string, i?: unknown, o?: unknown) => Promise<unknown>)(name, input, options),
  openExternal: async (url) => {
    if (!orca.shell) throw new Error('This Orca cannot open the browser from a panel.')
    return orca.shell.openExternal(url)
  },
  storageGet: (key) => orca.storage.get(key),
  storageSet: (key, value) => orca.storage.set(key, value as never)
}

function Root() {
  const [s, app] = useApp()
  useEffect(() => {
    const off = orca.plugin.on('auth.changed', (state: AuthState) => app.applyAuth(state))
    // Colours from Backlog follow the theme: redraw when Orca's changes.
    const isDark = () => document.documentElement.classList.contains('dark')
    app.set({ dark: isDark() })
    const offTheme = orca.on('theme', () => app.set({ dark: isDark() }))
    // Another workspace may belong to an Orca project that uses another account.
    const offWs = orca.on('workspace.changed', () => void app.runAuth(() => app.host.request('auth.status')))
    return () => {
      off.dispose()
      offWs.dispose()
      offTheme.dispose()
    }
  }, [])
  if (s.session === undefined) {
    return (
      <div class="screen center-screen">
        <Spinner label="Connecting to Backlog" />
      </div>
    )
  }
  if (!s.session) return <LoginView />
  if (s.openKey) return <DetailView issueKey={s.openKey} />
  if (s.screen === 'settings') return <SettingsView />
  if (s.screen === 'ai') return <AiView />
  if (s.screen === 'issues') return <IssuesView me={s.session} />
  return <HomeView me={s.session} />
}

const app = new App(host, uiDialogs)
render(
  <AppContext.Provider value={app}>
    <Root />
    <MenuLayer />
    <DialogLayer />
  </AppContext.Provider>,
  document.getElementById('app')!
)
void app.start()
