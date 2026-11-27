<div align="center">

# Backlog for Orca

**Your Nulab Backlog issues in Orca's sidebar.**<br>
Find the ticket, read it, and hand it to an agent without leaving your workspace.

[![Version](https://img.shields.io/badge/version-v0.3.14-2c9a7a)](https://github.com/ngxuancam/orca-backlog/releases/latest)
[![Orca plugin](https://img.shields.io/badge/Orca-plugin-1c1c1c)](https://orca.dev/plugins/ngxuancam/orca-backlog)
[![License: MIT](https://img.shields.io/badge/license-MIT-444)](LICENSE)

<img src="assets/store/cover.png" alt="Backlog for Orca: the dashboard in dark and an issue detail in light, laid out like Backlog" width="100%">

</div>

---

## Why

Working a Backlog ticket usually means a browser tab for the issue, another for the pull request,
a download folder full of screenshots, and copy-pasting the description into your agent.
Backlog for Orca puts all of it in Orca's right sidebar, laid out like Backlog itself in Orca's
light and dark themes, and starts an agent on the ticket in one click.

## Features

### 🏠 A dashboard like Backlog's

<table>
  <tr><th>Dark</th><th>Light</th></tr>
  <tr>
    <td><img src="assets/home-dark.png" alt="Dashboard: projects, my pull requests with a conflict flagged, and My Issues, dark theme" width="400"></td>
    <td><img src="assets/home-light.png" alt="Dashboard: projects, my pull requests with a conflict flagged, and My Issues, light theme" width="400"></td>
  </tr>
</table>

- **Projects** you belong to; click one to open its issues with the project filter already set.
- **My pull requests**, open, in every project; a red **Conflict** when one would not merge.
- **My Issues**: *Assigned to me* / *Created by me*, then *All*, *4 Days*, *Due Today*, *Overdue*,
  each with its count, the way Backlog's own dashboard shows them.
- Issue types and statuses in the colours your space sets; right-click any issue for its actions
  (open, assign, copy key or link); drag a column's edge to size it.

### 🔎 Search and filters

- Keyword search, **project**, **assignee** (you by default, anyone, or a teammate), **status**
  (Not closed, All, or one) and **priority**.
- **Advanced filters**: issue type, category, version, milestone, registered by, resolution,
  subtasking, attached and shared — the same fields as Backlog's Advanced Search.
- Sortable columns and paging as you scroll. Filters share one row on a wide panel and wrap when
  it's narrow, and they're remembered.
- Teammates who share a display name show their login, so you pick the right one.

### 📄 Everything about an issue

<table>
  <tr><th>Dark</th><th>Light</th></tr>
  <tr>
    <td><img src="assets/detail-dark.png" alt="Issue detail laid out like Backlog: dates and status, the description with an inline image, and the properties, dark theme" width="400"></td>
    <td><img src="assets/detail-light.png" alt="Issue detail laid out like Backlog: dates and status, the description with an inline image, and the properties, light theme" width="400"></td>
  </tr>
</table>

- Laid out like Backlog's issue page: type, key, dates and status; the description and comments
  as Backlog shows them, with their **images inline** (loaded as you scroll; press one to see it
  big); the properties in two columns; tabs for attachments, subtasking, pull requests, links
  and worktrees.
- **Assign** from the Assignee line or a right-click; it then offers to assign the issue's open
  pull requests too (and the other way round from a pull request).
- **Comment / Change Status** at the bottom: paste or drop screenshots straight into the comment.
- **Linked issues**: parent, subtasks and related issues; open one and *Back* returns here.
- **Pull requests** that link the issue, in any of the project's Git repositories, open ones included.
- **Attachments**: images and videos open in Orca's preview; anything else is saved to
  `~/Downloads/orca-backlog-<project>/` and its folder opens.

### ✨ Backlog AI

<table>
  <tr><th>Dark</th><th>Light</th></tr>
  <tr>
    <td><img src="assets/ai-dark.png" alt="Backlog AI chat: a question about open checkout bugs and its answer, dark theme" width="400"></td>
    <td><img src="assets/ai-light.png" alt="Backlog AI chat: a question about open checkout bugs and its answer, light theme" width="400"></td>
  </tr>
</table>

- When your space has the Backlog AI Assistant, the 🤖 button opens a chat laid out like
  Backlog's: ask about your issues, follow up, or pick up an earlier chat from its history.
  **Summarize** on an issue asks it for you.

### 🤖 Hand it to an agent

- Pick a workspace (or a new worktree), an agent and a **skill**; the issue becomes the agent's task.
- Your last agent, skill and workspace are remembered for the next ticket.

### 👥 Several accounts

<table>
  <tr><th>Dark</th><th>Light</th></tr>
  <tr>
    <td><img src="assets/settings-dark.png" alt="Settings: two accounts and the audit log of changes, dark theme" width="400"></td>
    <td><img src="assets/settings-light.png" alt="Settings: two accounts and the audit log of changes, light theme" width="400"></td>
  </tr>
</table>

- Add as many Backlog accounts as you need; switch from the account button at the top.
- Each **Orca project remembers its account**: switch once while you're in it, or set it in ⚙ Settings.
  Moving to another workspace switches to its account by itself.

## Install

Requires **Orca 1.4.259** or later, on macOS, Windows or Linux.

```sh
orca plugin install ngxuancam/orca-backlog
```

Or in Orca: **Settings → Plugins → Add plugin → From a Git URL…** and paste
`https://github.com/ngxuancam/orca-backlog`.

Orca shows the access the plugin asks for (its own storage and encrypted secrets, reading and
opening your workspaces, creating worktrees, starting agents) and asks you to approve it.

Then open **Backlog Tasks** in the right sidebar and sign in with your space
(`your-space.backlog.com`) and a personal API key from *Backlog → Personal settings → API*.

## Tips

- **Right-click** (or ⋯) any issue, pull request, link, worktree, comment or attachment for its
  actions; drag a column's edge to size it (double-click for the default); every dropdown has a
  search box (accents and case ignored); paste (Ctrl+V) or drop images straight into a comment.
- **Already use [backlog-mcp-server](https://github.com/nulab/backlog-mcp-server)?** The Connect
  screen lists every `BACKLOG_DOMAIN` / `BACKLOG_API_KEY` entry it finds (Claude, Cursor, Windsurf,
  Gemini, Codex, VS Code, and the workspace's `.mcp.json`); press one to sign in. Keys stay in the
  plugin's worker; the panel only shows their last four characters.
- **Start agent** sends `/your-skill ISSUE-KEY` when a skill is chosen (`$your-skill` for Codex);
  with no skill, edit the prompt above the button first. Orca then shows the agent's terminal, and
  the issue lists it under *Worktrees*: press one to go back to it.
- **Worktrees** of an issue can also be linked by hand (*Link a worktree*). Pressing one shows it
  with its terminal, opening a terminal when it has none; ✕ unlinks it, and a deleted worktree
  drops off the list by itself.
- **Pull request conflicts**: open pull requests (on Home under *My pull requests*, and in an
  issue) get a red *Conflict* badge when they would not merge cleanly. Backlog's API does not say,
  so the check uses git on a clone of the repository among your Orca workspaces: it fetches only
  the PR's two branches and runs `git merge-tree` (git 2.38+), leaving your working tree alone.
- **Edit an issue**: the ✏️ in the issue's header (which stays at the top) turns the summary and
  description into fields in place. The **Update issue** bar pinned at the bottom opens upward with
  a comment box and status, assignee, priority, type, category, milestone, dates and hours. Each
  save sends only what changed, with the comment, as Backlog records it.
- **Backlog AI**: when your space has the Backlog AI Assistant (Premium plan and above, turned on
  by an administrator), the 🤖 button at the top opens a chat screen laid out like Backlog's own:
  ask anything ("find the issues about…", "summarise APP-12"), follow up in the same chat, start a
  **New chat**, or open the **Chat history** (searchable) to continue an earlier one. It warns when
  the month's AI credit is nearly used. Spaces without the assistant don't show the button.
  Backlog has no API for it, so the plugin uses its web chat in a tab of Orca's browser signed in
  to your space (sign in there once; the plugin never reads the session). It is unofficial: a
  Backlog release can break it, while the web chat keeps working. Changes the assistant proposes
  (adding or updating issues) are approved on the web: **Open in Backlog**.
- **Images in a comment**: under the comment box, **Paste image** attaches the image on the
  clipboard (a screenshot; on Windows, files copied in Explorer too) and **Attach file…** opens the
  system's file dialog. Images are uploaded with the comment and shown in it (`![image][name]`, or
  `#image(name)` in a Backlog-notation project); other files are attached. On Linux, pasting needs
  `wl-clipboard` or `xclip`, and the dialog `zenity` or `kdialog`.
- **Columns** (above each issue table) picks which fields it shows, like Backlog's own column
  setting: assignee, registered by, dates, category, milestone, version, hours… **Widths** beside
  it sizes each shown column (XS to L, or Fill). The picked columns stay; widths last until you
  leave the list (opening an issue and coming back keeps them). *Reset columns* puts the defaults back; click a header to sort.
- **Links** in an issue (its page, pull requests, and those in the description and comments) open
  in the browser on a click; their **⋯** menu offers *Copy link*, *Open in browser* and *Open in
  Orca* (Orca's own browser).
- **Settings → Audit log** lists every change the plugin made: to Backlog (with the API call, e.g.
  `PATCH /api/v2/issues/APP-1`) and on this computer (accounts, settings, agents started, files
  saved), failed ones too. The newest 500 stay on this computer; API keys are never logged.
- Previews saved in a workspace go to `.orca-backlog/`, a folder git ignores on its own. It cleans
  itself: an issue's previews go after 7 days unopened, and the folder stays under 200 MB.
- **Behind a company proxy or antivirus** (`SELF_SIGNED_CERT_IN_CHAIN`)? The plugin trusts your
  system's certificate store by default. If IT hands out a root certificate as a file instead, add
  it under *Settings → Connection*, then press *Test connection*.
- Very long descriptions or comments are shortened in the panel; *Open in Backlog* (top right)
  shows the rest.

## Privacy and security

- The plugin talks to your Backlog space directly from your computer, with the same API calls
  nulab/backlog-mcp-server makes. API keys stay in Orca's encrypted plugin secrets; nothing is
  sent anywhere else, and there is no tracking.
- It never writes into its own plugin folder, so Orca's integrity check of an installed copy
  always holds.
- Every few hours it asks GitHub for this plugin's latest release (no token, no data about you)
  and shows a status bar item only when a newer version is out; press it for the release notes.
- The screenshots here come from mock data (a fictional "Acme Shop"): `node scripts/capture-store.mjs`
  retakes them all.
- Each [release](https://github.com/ngxuancam/orca-backlog/releases) has the source as `.zip` and
  `.tar.gz` with `MD5SUMS`, `SHA1SUMS`, `SHA256SUMS` and `SHA512SUMS`:

  ```sh
  sha256sum -c SHA256SUMS --ignore-missing
  ```

- Dependabot watches dependencies and GitHub Actions; `main` only changes through pull requests.

## Develop

```sh
npm i                      # typings and the web panel's libraries
npm run typecheck          # the worker, then the web panel
npm run build:web          # src/web -> dist/web
orca plugin test . --json
orca plugin check . --json
orca plugin dev watch . --check --json
```

| File              | Role                                                         |
| ----------------- | ------------------------------------------------------------ |
| `src/protocol.ts` | Panel ↔ worker contract                                      |
| `src/web/`        | The panel: a web page (Preact), built into `dist/web`        |
| `src/worker.ts`   | Request handlers                                             |
| `src/backlog.ts`  | Backlog API client and credential discovery                  |
| `src/accounts.ts` | Saved accounts and the account of each Orca project          |
| `src/inline.ts`   | Backlog text to Markdown, image references to previews       |
| `src/files.ts`    | Saving attachments, revealing and opening files              |
| `src/orcaCli.ts`  | Installed agents and skills, as Orca lists them              |

The main panel is compiled, because Orca's own transpiler targets its components: after changing
`src/web`, run `npm run build:web` and commit `dist/` with it (Orca installs without a build step).
Preact, marked and DOMPurify are copied into `dist/web/vendor` from `node_modules` (their licenses
in `LICENSES.txt`). To look at it with mock data only, run `node scripts/preview-web.mjs` and open
`http://localhost:5179/web/preview.html#home` (or `#issues`, `#detail`, `#ai`, `#settings`,
`#signedOut`; add `&dark`).

To release, run `npm run set-version X.Y.Z` (it sets the manifest, `package.json` and the README
badge), merge, then push a `vX.Y.Z` tag: a workflow attaches the archives and checksums to the GitHub release, and the
[Orca plugin directory](https://orca.dev/plugins/ngxuancam/orca-backlog) lists the new version.

## License

[MIT](LICENSE) © ngxuancam

Backlog is a product of Nulab Inc. This plugin is an independent project, not made or endorsed by Nulab.

---

<div align="center">

Made by **Nguyen Xuan Cam** · [nguyenxuancam.com](https://nguyenxuancam.com)

</div>
