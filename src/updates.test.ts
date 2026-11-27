import { assert, test } from 'orca/testing'
import { isNewer, latestRelease, parseVersion } from './updates'

test('compares versions number by number', () => {
  assert.deepEqual(parseVersion('v0.3.12'), [0, 3, 12])
  assert.equal(parseVersion('v1.0.0-beta'), null)
  assert.equal(isNewer('v0.3.13', '0.3.12'), true)
  assert.equal(isNewer('0.10.0', '0.9.9'), true, 'not as text')
  assert.equal(isNewer('0.3.12', '0.3.12'), false)
  assert.equal(isNewer('0.3.11', '0.3.12'), false)
  assert.equal(isNewer('nonsense', '0.3.12'), false)
})

test('reads GitHub latest release; drafts, pre-releases and odd tags count as none', async () => {
  const seen: { url: string; headers: Record<string, string> }[] = []
  const answer = (body: unknown, status = 200) =>
    (async (url: string | URL, init?: RequestInit) => {
      seen.push({ url: String(url), headers: init?.headers as Record<string, string> })
      return new Response(JSON.stringify(body), { status })
    }) as typeof fetch
  assert.deepEqual(await latestRelease(answer({ tag_name: 'v0.4.0', html_url: 'https://github.com/ngxuancam/orca-backlog/releases/tag/v0.4.0' })), {
    version: '0.4.0',
    url: 'https://github.com/ngxuancam/orca-backlog/releases/tag/v0.4.0'
  })
  assert.equal(seen[0]!.url, 'https://api.github.com/repos/ngxuancam/orca-backlog/releases/latest')
  // Nothing about the person: a generic User-Agent, no token.
  assert.deepEqual(Object.keys(seen[0]!.headers).sort(), ['Accept', 'User-Agent'])
  assert.equal(seen[0]!.headers['User-Agent'], 'orca-backlog-plugin')
  assert.equal(await latestRelease(answer({ tag_name: 'v0.5.0', draft: true })), null)
  assert.equal(await latestRelease(answer({ tag_name: 'v0.5.0-rc1' })), null)
  assert.equal(await latestRelease(answer({ message: 'Not Found' }, 404)), null)
  // A link elsewhere is not followed.
  assert.equal((await latestRelease(answer({ tag_name: 'v0.4.0', html_url: 'https://evil.example/x' })))!.url, 'https://github.com/ngxuancam/orca-backlog/releases/latest')
  await assert.rejects(latestRelease(answer({}, 403)), /GitHub 403/)
})
