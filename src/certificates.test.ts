import { generateKeyPairSync } from 'node:crypto'
import { assert, test } from 'orca/testing'
import tls from 'node:tls'
import { pemCertificates } from './certificates'

test('reads every certificate block of a PEM bundle', () => {
  const [first, second] = tls.getCACertificates('bundled')
  const bundle = `Company root\n${first}\nintermediate\n${second}\n`
  assert.deepEqual(pemCertificates(bundle), [first.trim(), second.trim()])
})

test('refuses a file without certificates', () => {
  const key = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' })
  assert.throws(() => pemCertificates(String(key)), /no PEM certificate/)
  assert.throws(() => pemCertificates('-----BEGIN CERTIFICATE-----\nnot base64\n-----END CERTIFICATE-----'))
})
