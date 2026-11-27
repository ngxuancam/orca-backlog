// The Backlog panel as a web page (Orca's HTML panel). Built by `npm run build:web` into dist/web;
// the same worker answers it as the components panel (src/panel.tsx).
import { h, render } from './vendor/preact.js';
import { useEffect } from './vendor/hooks.js';
import { AiView } from './ai.js';
import { App } from './app.js';
import { DetailView } from './detail.js';
import { HomeView, IssuesView } from './screens.js';
import { LoginView, SettingsView } from './settings.js';
import { AppContext, DialogLayer, MenuLayer, Spinner, uiDialogs, useApp } from './ui.js';
const host = {
    request: (name, input, options) => orca.plugin.request(name, input, options),
    openExternal: async (url) => {
        if (!orca.shell)
            throw new Error('This Orca cannot open the browser from a panel.');
        return orca.shell.openExternal(url);
    },
    storageGet: (key) => orca.storage.get(key),
    storageSet: (key, value) => orca.storage.set(key, value)
};
function Root() {
    const [s, app] = useApp();
    useEffect(() => {
        const off = orca.plugin.on('auth.changed', (state) => app.applyAuth(state));
        // Colours from Backlog follow the theme: redraw when Orca's changes.
        const isDark = () => document.documentElement.classList.contains('dark');
        app.set({ dark: isDark() });
        const offTheme = orca.on('theme', () => app.set({ dark: isDark() }));
        // Another workspace may belong to an Orca project that uses another account.
        const offWs = orca.on('workspace.changed', () => void app.runAuth(() => app.host.request('auth.status')));
        return () => {
            off.dispose();
            offWs.dispose();
            offTheme.dispose();
        };
    }, []);
    if (s.session === undefined) {
        return (h("div", { class: "screen center-screen" },
            h(Spinner, { label: "Connecting to Backlog" })));
    }
    if (!s.session)
        return h(LoginView, null);
    if (s.openKey)
        return h(DetailView, { issueKey: s.openKey });
    if (s.screen === 'settings')
        return h(SettingsView, null);
    if (s.screen === 'ai')
        return h(AiView, null);
    if (s.screen === 'issues')
        return h(IssuesView, { me: s.session });
    return h(HomeView, { me: s.session });
}
const app = new App(host, uiDialogs);
render(h(AppContext.Provider, { value: app },
    h(Root, null),
    h(MenuLayer, null),
    h(DialogLayer, null)), document.getElementById('app'));
void app.start();
