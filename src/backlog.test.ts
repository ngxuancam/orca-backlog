import { assert, test } from 'orca/testing'
import { credentialPairs } from './backlog'

test('reads backlog-mcp-server pairs from JSON, JSON with comments and TOML', () => {
  const json = JSON.stringify({
    mcpServers: {
      a: { env: { BACKLOG_DOMAIN: 'https://one.backlog.com/', BACKLOG_API_KEY: 'key1' } },
      b: { env: { BACKLOG_DOMAIN: 'two.backlog.jp', BACKLOG_API_KEY: 'key2' } }
    }
  })
  assert.deepEqual(credentialPairs(json), [
    { space: 'one.backlog.com', apiKey: 'key1' },
    { space: 'two.backlog.jp', apiKey: 'key2' }
  ])
  const jsonc = '{ // VS Code\n "servers": { "backlog": { "env": { "BACKLOG_DOMAIN": "three.backlog.com", "BACKLOG_API_KEY": "key3" } } } }'
  assert.deepEqual(credentialPairs(jsonc), [{ space: 'three.backlog.com', apiKey: 'key3' }])
  const toml = '[mcp_servers.backlog.env]\nBACKLOG_DOMAIN = "four.backlog.com"\nBACKLOG_API_KEY = "key4"\n'
  assert.deepEqual(credentialPairs(toml), [{ space: 'four.backlog.com', apiKey: 'key4' }])
})

test('skips placeholders and half entries', () => {
  assert.deepEqual(credentialPairs('{"BACKLOG_DOMAIN":"x.backlog.com","BACKLOG_API_KEY":"${input:backlogKey}"}'), [])
  assert.deepEqual(credentialPairs('{"BACKLOG_DOMAIN":"x.backlog.com"}'), [])
})
