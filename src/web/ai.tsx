// Backlog AI, laid out like Backlog's chat: the history beside the chat when the panel is wide
// (a toggle when narrow), questions in bubbles on the right, answers on the left, the box at the
// bottom, and the view kept at the newest message.
import { h } from './vendor/preact.js'
import { useEffect, useRef } from './vendor/hooks.js'
import { ago, toolLabel, type AiTurn } from './app.js'
import { Icon } from './icons.js'
import { Markdown } from './markdown.js'
import { Button, Callout, cx, Empty, IconButton, Notice, openMenu, Spinner, Textarea, useApp } from './ui.js'

function CreditNotice() {
  const [s] = useApp()
  const usage = s.aiHistory?.usage
  if (!usage || (usage.state !== 'warning' && usage.state !== 'unavailable')) return null
  const used = usage.percent === null ? '' : ` (${usage.percent}% used)`
  return usage.state === 'unavailable' ? (
    <Callout tone="danger" title="Out of AI credits for the month">{`Backlog AI is unavailable until the 1st of next month${used}.`}</Callout>
  ) : (
    <Callout tone="warning" title="You're almost out of AI credits for the month">{`Once the limit is hit, your organization loses the assistant until the 1st of next month${used}.`}</Callout>
  )
}

function History() {
  const [s, app] = useApp()
  const search = s.aiSearch.trim().toLowerCase()
  const current = s.aiChat.threadId
  const threads = (s.aiHistory?.threads ?? []).filter((t) => !search || t.title.toLowerCase().includes(search))
  return (
    <aside class="ai-history">
      <div class="search-row">
        <Icon name="search" />
        <input class="search-input" type="search" aria-label="Search chat history" placeholder="Search chat history" value={s.aiSearch} onInput={(e) => app.set({ aiSearch: (e.currentTarget as HTMLInputElement).value })} />
      </div>
      <div class="ai-history-head">
        <span class="muted small">Chat history</span>
        <Button size="sm" variant="ghost" icon="plus" onClick={() => app.newAiChat()}>
          New chat
        </Button>
      </div>
      {!s.aiHistory ? (
        <Spinner label="Loading chats" />
      ) : threads.length ? (
        <ul class="thread-list">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                class={cx('thread', t.id === current && 'is-active')}
                title={`${t.title} · ${ago(t.updated)}`}
                onClick={() => void app.openAiThread(t)}
                onContextMenu={(e) =>
                  openMenu(e as unknown as MouseEvent, [
                    { label: 'Open', icon: 'next', onSelect: () => void app.openAiThread(t) },
                    { label: 'Copy title', icon: 'copy', onSelect: () => void app.copyText('ai', t.title, 'Copied the title') }
                  ])
                }
              >
                {t.title}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon="history">{search ? 'No chat matches.' : 'No chats yet.'}</Empty>
      )}
    </aside>
  )
}

function Answer({ turn }: { turn: AiTurn }) {
  const [, app] = useApp()
  const { answer } = turn
  return (
    <div class="ai-answer">
      {answer.text.trim() ? <Markdown text={answer.text} place="ai" /> : <Empty icon="bot">No answer text.</Empty>}
      {answer.approval ? <Callout tone="warning">{`It wants to ${toolLabel(answer.approval)}. Approve or decline that in Backlog (Open in Backlog).`}</Callout> : null}
      <div class="ai-answer-foot">
        <IconButton icon="copy" label="Copy the answer" disabled={!answer.text.trim()} onClick={() => void app.copyText('ai', answer.text, 'Copied the answer')} />
        {answer.tools.length ? <span class="muted small">Looked at: {answer.tools.map(toolLabel).join(', ')}</span> : null}
      </div>
    </div>
  )
}

export function AiView() {
  const [s, app] = useApp()
  const chat = s.aiChat
  const end = useRef<HTMLDivElement>(null)
  const title = chat.title ?? chat.turns[0]?.question ?? s.aiAsking ?? 'Backlog AI'
  // Keep the newest message in view, as a chat does.
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [chat.turns.length, s.aiAsking, s.aiLoading])
  return (
    <div class={cx('screen', 'ai-screen', s.aiShowHistory && 'show-history')}>
      <header class="topbar">
        <div class="topbar-row">
          <IconButton icon="back" label="Back" onClick={() => app.goHome()} />
          <h1 class="topbar-title" title={title}>
            {title}
          </h1>
          <div class="topbar-actions">
            <IconButton icon="history" label="Chat history" active={s.aiShowHistory} class="history-toggle" onClick={() => app.set({ aiShowHistory: !s.aiShowHistory })} />
            <IconButton icon="plus" label="New chat" disabled={!!s.aiAsking} onClick={() => app.newAiChat()} />
            <IconButton icon="external" label="Open in Backlog" onClick={() => void app.openAiOnWeb()} />
          </div>
        </div>
      </header>
      <div class="ai-layout">
        <History />
        <div class="ai-chat">
          <div class="ai-messages">
            {s.aiLoading ? (
              <Spinner label="Loading the chat" />
            ) : chat.turns.length || s.aiAsking ? (
              <div class="divider">{chat.more ? 'Earlier messages are in Backlog' : 'Beginning of conversation'}</div>
            ) : (
              <div class="ai-welcome">
                <Icon name="bot" size={28} />
                <h2>How can I help?</h2>
                <p class="muted">Backlog AI reads the issues, wikis and documents of the projects you are in.</p>
                <div class="row wrap center">
                  {['Summarise my open issues', 'What changed this week?', 'Find issues about '].map((idea) => (
                    <Button key={idea} size="sm" onClick={() => app.set({ aiDraft: idea })}>
                      {idea.trim()}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {s.aiLoading
              ? null
              : chat.turns.map((turn, i) => (
                  <div key={i} class="ai-turn">
                    {turn.question ? <div class="bubble">{turn.question}</div> : null}
                    <Answer turn={turn} />
                  </div>
                ))}
            {s.aiAsking ? (
              <div class="ai-turn">
                <div class="bubble">{s.aiAsking}</div>
                <div class="typing" aria-label="Thinking">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ) : null}
            <div ref={end} />
          </div>
          <div class="ai-compose">
            <CreditNotice />
            <Notice place="ai" />
            <div class="compose-box">
              <Textarea
                label="Ask Backlog AI"
                hideLabel
                rows={1}
                maxRows={8}
                autoFocus
                enterSends
                placeholder={chat.turns.length ? 'Ask a follow-up' : 'Ask me anything'}
                value={s.aiDraft}
                onInput={(aiDraft) => app.set({ aiDraft })}
                onSubmit={() => void app.askAi()}
              />
              <Button variant="primary" icon="send" disabled={!!s.aiAsking || !!s.aiLoading || !s.aiDraft.trim()} onClick={() => void app.askAi()}>
                Send
              </Button>
            </div>
            <div class="muted small center">AI can make mistakes; double-check outcomes. Enter sends, Shift+Enter for a new line.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
