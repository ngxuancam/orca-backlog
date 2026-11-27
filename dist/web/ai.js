// Backlog AI, laid out like Backlog's chat: the history beside the chat when the panel is wide
// (a toggle when narrow), questions in bubbles on the right, answers on the left, the box at the
// bottom, and the view kept at the newest message.
import { h } from './vendor/preact.js';
import { useEffect, useRef } from './vendor/hooks.js';
import { ago, toolLabel } from './app.js';
import { Icon } from './icons.js';
import { Markdown } from './markdown.js';
import { Button, Callout, cx, Empty, IconButton, Notice, openMenu, Spinner, Textarea, useApp } from './ui.js';
function CreditNotice() {
    const [s] = useApp();
    const usage = s.aiHistory?.usage;
    if (!usage || (usage.state !== 'warning' && usage.state !== 'unavailable'))
        return null;
    const used = usage.percent === null ? '' : ` (${usage.percent}% used)`;
    return usage.state === 'unavailable' ? (h(Callout, { tone: "danger", title: "Out of AI credits for the month" }, `Backlog AI is unavailable until the 1st of next month${used}.`)) : (h(Callout, { tone: "warning", title: "You're almost out of AI credits for the month" }, `Once the limit is hit, your organization loses the assistant until the 1st of next month${used}.`));
}
function History() {
    const [s, app] = useApp();
    const search = s.aiSearch.trim().toLowerCase();
    const current = s.aiChat.threadId;
    const threads = (s.aiHistory?.threads ?? []).filter((t) => !search || t.title.toLowerCase().includes(search));
    return (h("aside", { class: "ai-history" },
        h("div", { class: "search-row" },
            h(Icon, { name: "search" }),
            h("input", { class: "search-input", type: "search", "aria-label": "Search chat history", placeholder: "Search chat history", value: s.aiSearch, onInput: (e) => app.set({ aiSearch: e.currentTarget.value }) })),
        h("div", { class: "ai-history-head" },
            h("span", { class: "muted small" }, "Chat history"),
            h(Button, { size: "sm", variant: "ghost", icon: "plus", onClick: () => app.newAiChat() }, "New chat")),
        !s.aiHistory ? (h(Spinner, { label: "Loading chats" })) : threads.length ? (h("ul", { class: "thread-list" }, threads.map((t) => (h("li", { key: t.id },
            h("button", { type: "button", class: cx('thread', t.id === current && 'is-active'), title: `${t.title} · ${ago(t.updated)}`, onClick: () => void app.openAiThread(t), onContextMenu: (e) => openMenu(e, [
                    { label: 'Open', icon: 'next', onSelect: () => void app.openAiThread(t) },
                    { label: 'Copy title', icon: 'copy', onSelect: () => void app.copyText('ai', t.title, 'Copied the title') }
                ]) }, t.title)))))) : (h(Empty, { icon: "history" }, search ? 'No chat matches.' : 'No chats yet.'))));
}
function Answer({ turn }) {
    const [, app] = useApp();
    const { answer } = turn;
    return (h("div", { class: "ai-answer" },
        answer.text.trim() ? h(Markdown, { text: answer.text, place: "ai" }) : h(Empty, { icon: "bot" }, "No answer text."),
        answer.approval ? h(Callout, { tone: "warning" }, `It wants to ${toolLabel(answer.approval)}. Approve or decline that in Backlog (Open in Backlog).`) : null,
        h("div", { class: "ai-answer-foot" },
            h(IconButton, { icon: "copy", label: "Copy the answer", disabled: !answer.text.trim(), onClick: () => void app.copyText('ai', answer.text, 'Copied the answer') }),
            answer.tools.length ? h("span", { class: "muted small" },
                "Looked at: ",
                answer.tools.map(toolLabel).join(', ')) : null)));
}
export function AiView() {
    const [s, app] = useApp();
    const chat = s.aiChat;
    const end = useRef(null);
    const title = chat.title ?? chat.turns[0]?.question ?? s.aiAsking ?? 'Backlog AI';
    // Keep the newest message in view, as a chat does.
    useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [chat.turns.length, s.aiAsking, s.aiLoading]);
    return (h("div", { class: cx('screen', 'ai-screen', s.aiShowHistory && 'show-history') },
        h("header", { class: "topbar" },
            h("div", { class: "topbar-row" },
                h(IconButton, { icon: "back", label: "Back", onClick: () => app.goHome() }),
                h("h1", { class: "topbar-title", title: title }, title),
                h("div", { class: "topbar-actions" },
                    h(IconButton, { icon: "history", label: "Chat history", active: s.aiShowHistory, class: "history-toggle", onClick: () => app.set({ aiShowHistory: !s.aiShowHistory }) }),
                    h(IconButton, { icon: "plus", label: "New chat", disabled: !!s.aiAsking, onClick: () => app.newAiChat() }),
                    h(IconButton, { icon: "external", label: "Open in Backlog", onClick: () => void app.openAiOnWeb() })))),
        h("div", { class: "ai-layout" },
            h(History, null),
            h("div", { class: "ai-chat" },
                h("div", { class: "ai-messages" },
                    s.aiLoading ? (h(Spinner, { label: "Loading the chat" })) : chat.turns.length || s.aiAsking ? (h("div", { class: "divider" }, chat.more ? 'Earlier messages are in Backlog' : 'Beginning of conversation')) : (h("div", { class: "ai-welcome" },
                        h(Icon, { name: "bot", size: 28 }),
                        h("h2", null, "How can I help?"),
                        h("p", { class: "muted" }, "Backlog AI reads the issues, wikis and documents of the projects you are in."),
                        h("div", { class: "row wrap center" }, ['Summarise my open issues', 'What changed this week?', 'Find issues about '].map((idea) => (h(Button, { key: idea, size: "sm", onClick: () => app.set({ aiDraft: idea }) }, idea.trim())))))),
                    s.aiLoading
                        ? null
                        : chat.turns.map((turn, i) => (h("div", { key: i, class: "ai-turn" },
                            turn.question ? h("div", { class: "bubble" }, turn.question) : null,
                            h(Answer, { turn: turn })))),
                    s.aiAsking ? (h("div", { class: "ai-turn" },
                        h("div", { class: "bubble" }, s.aiAsking),
                        h("div", { class: "typing", "aria-label": "Thinking" },
                            h("span", null),
                            h("span", null),
                            h("span", null)))) : null,
                    h("div", { ref: end })),
                h("div", { class: "ai-compose" },
                    h(CreditNotice, null),
                    h(Notice, { place: "ai" }),
                    h("div", { class: "compose-box" },
                        h(Textarea, { label: "Ask Backlog AI", hideLabel: true, rows: 1, maxRows: 8, autoFocus: true, enterSends: true, placeholder: chat.turns.length ? 'Ask a follow-up' : 'Ask me anything', value: s.aiDraft, onInput: (aiDraft) => app.set({ aiDraft }), onSubmit: () => void app.askAi() }),
                        h(Button, { variant: "primary", icon: "send", disabled: !!s.aiAsking || !!s.aiLoading || !s.aiDraft.trim(), onClick: () => void app.askAi() }, "Send")),
                    h("div", { class: "muted small center" }, "AI can make mistakes; double-check outcomes. Enter sends, Shift+Enter for a new line."))))));
}
