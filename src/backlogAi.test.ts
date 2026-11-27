// The page script of src/backlogAi.ts, run here against a stubbed fetch: no browser, no Backlog.
import { afterEach, assert, test } from 'orca/testing'
import { askExpression, failureMessage, getExpression, readFetched, readResult, readStatus, STATUS_EXPRESSION, toHistory, toTurns } from './backlogAi'

const realFetch = globalThis.fetch
const g = globalThis as unknown as { document?: unknown }
afterEach(() => {
  globalThis.fetch = realFetch
  delete g.document
})

/** Server-sent events as the web chat streams them. */
const sse = (...events: unknown[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n'

/** Runs the page script with `fetch` answering `response`; returns what it sent and resolved to. */
async function run(response: () => Response, question = 'Find the login bugs', threadId: string | null = null) {
  g.document = { documentElement: { lang: 'ja' } }
  const sent: { url: string; init: RequestInit }[] = []
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    sent.push({ url: String(url), init: init! })
    return response()
  }) as typeof fetch
  const json = await (0, eval)(askExpression(question, threadId))
  return { sent, result: readResult(json) }
}

test('asks the web chat and puts the streamed answer together', async () => {
  const { sent, result } = await run(() =>
    new Response(
      sse(
        { threadId: 'th-1', runId: 'r' },
        { type: 'start', payload: {} },
        { type: 'tool-call', payload: { toolName: 'search-issues-tool' } },
        { type: 'tool-call', payload: { toolName: 'search-issues-tool' } },
        { type: 'text-delta', payload: { text: 'Two issues: ' } },
        { type: 'text-delta', payload: { text: 'APP-1, APP-2.' } },
        { type: 'finish', payload: { messages: ['the whole conversation again'] } }
      ),
      { status: 200, headers: { 'content-type': 'text/plain; charset=UTF-8' } }
    )
  )
  assert.deepEqual(result, { ok: true, threadId: 'th-1', text: 'Two issues: APP-1, APP-2.', tools: ['search-issues-tool'], approval: null })
  assert.equal(sent[0]!.url, '/ai/agents/ai-assistant/stream')
  assert.equal(sent[0]!.init.method, 'POST')
  assert.equal(sent[0]!.init.credentials, 'same-origin')
  assert.deepEqual(JSON.parse(String(sent[0]!.init.body)), {
    messages: [{ role: 'user', content: 'Find the login bugs' }],
    requestContext: { lang: 'ja' }
  })
})

test('a follow-up stays in the thread; a proposed change is reported, not made', async () => {
  const { sent, result } = await run(
    () => new Response(sse({ type: 'tool-call-approval', payload: { toolName: 'add-issue-tool' } }, { type: 'text-delta', payload: { text: 'Shall I?' } })),
    'Make an issue for it',
    'th-1'
  )
  assert.deepEqual(JSON.parse(String(sent[0]!.init.body)).memory, { thread: { id: 'th-1' } })
  assert.equal(result.ok && result.threadId, 'th-1')
  assert.equal(result.ok && result.approval, 'add-issue-tool')
})

test('a question with quotes and backticks reaches the chat as typed', async () => {
  const question = 'Why "`${x}`" and \'quotes\' </script>\nnext line'
  const { sent } = await run(() => new Response(sse({ type: 'text-delta', payload: { text: 'ok' } })), question)
  assert.equal(JSON.parse(String(sent[0]!.init.body)).messages[0].content, question)
})

test('tells signed out, not enabled and other failures apart', async () => {
  const login = (await run(() => new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } }))).result
  assert.deepEqual(login, { ok: false, reason: 'login', status: 200 })
  assert.match(failureMessage(login as never, 'acme.backlog.com'), /Log in to acme\.backlog\.com in Orca's browser/)
  const disabled = (await run(() => new Response('no', { status: 403 }))).result
  assert.match(failureMessage(disabled as never, 'acme.backlog.com'), /Premium plan/)
  const broken = (await run(() => new Response('<html>bad</html>', { status: 400, headers: { 'content-type': 'text/html' } }))).result
  assert.equal(broken.ok === false && broken.reason, 'error')
  assert.match(failureMessage(broken as never, 'acme.backlog.com'), /HTTP 400/)
  const stopped = (await run(() => new Response(sse({ type: 'error', payload: { error: { message: 'Out of credits' } } })))).result
  assert.deepEqual(stopped, { ok: false, reason: 'error', message: 'Out of credits' })
  assert.deepEqual(readResult('not json'), { ok: false, reason: 'error', message: 'The Backlog tab gave no answer.' })
})

test('the space has the assistant when its page loads the chat and the plan allows it', () => {
  const page = (header: boolean, loader: boolean, plan: string | null) => {
    g.document = {
      querySelector: (q: string) => (q.startsWith('header') ? header : q.includes('chat-ui-loader') ? loader : null),
      scripts: [{ src: '', textContent: plan === null ? 'x' : `{"gantt":true,"aiAssistant":${plan},"aiAssistantUserRestriction":false}` }]
    }
    return readStatus((0, eval)(STATUS_EXPRESSION))
  }
  assert.equal(page(true, true, 'true'), 'available')
  assert.equal(page(true, false, 'false'), 'unavailable')
  assert.equal(page(true, true, 'false'), 'unavailable')
  assert.equal(page(false, false, null), 'signedOut')
  assert.equal(readStatus('nonsense'), 'unknown')
})

test('reads the chat history and a chat as Backlog keeps them', async () => {
  g.document = { documentElement: { lang: 'en' } }
  const seen: string[] = []
  globalThis.fetch = (async (url: string) => {
    seen.push(url)
    return url.includes('threads?')
      ? new Response(JSON.stringify([
          { id: 'a', title: 'Older', updatedAt: '2026-11-01T00:00:00Z' },
          { id: 'b', title: '', updatedAt: '2026-11-20T00:00:00Z' }
        ]))
      : new Response(JSON.stringify({ availability: 'warning', usagePercentage: 0.9145 }))
  }) as typeof fetch
  const [threads, usage] = readFetched(await (0, eval)(getExpression(['/memory/threads?agentId=ai-assistant', '/usage/availability'])), 2)
  assert.deepEqual(seen, ['/ai/memory/threads?agentId=ai-assistant', '/ai/usage/availability'])
  assert.deepEqual(toHistory(threads!, usage!), {
    threads: [
      { id: 'b', title: 'New chat', updated: Date.parse('2026-11-20T00:00:00Z') },
      { id: 'a', title: 'Older', updated: Date.parse('2026-11-01T00:00:00Z') }
    ],
    usage: { state: 'warning', percent: 91 }
  })
  // Newest first from Backlog; reasoning and step parts are not part of the answer.
  const chat = toTurns({
    status: 200,
    json: {
      messages: [
        { role: 'assistant', parts: [{ type: 'step-start' }, { type: 'reasoning', text: 'hmm' }, { type: 'tool-search-issues-tool' }, { type: 'text', text: 'Two.' }] },
        { role: 'user', parts: [{ type: 'text', text: 'How many?' }] },
        { role: 'assistant', parts: [{ type: 'text', text: 'Hi!' }] },
        { role: 'user', parts: [{ type: 'text', text: 'hello' }] }
      ],
      pagination: { hasMore: true }
    }
  })
  assert.deepEqual(chat.turns.map((t) => [t.question, t.answer.text, t.answer.tools]), [
    ['hello', 'Hi!', []],
    ['How many?', 'Two.', ['search-issues-tool']]
  ])
  assert.equal(chat.more, true)
  assert.deepEqual(readFetched('broken', 2), [{ status: 0, json: null }, { status: 0, json: null }])
})
