// Which CA certificates the worker's HTTPS trusts. Company proxies and antivirus re-sign HTTPS with
// their own root CA; Node rejects it (SELF_SIGNED_CERT_IN_CHAIN) unless it is trusted here, either
// from the OS certificate store or from a PEM file IT hands out.
import { X509Certificate } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import tls from 'node:tls'
import type { CertificateSettings, CertificateStatus } from './protocol'

export const DEFAULT_CERTIFICATES: CertificateSettings = { system: true, caFile: '' }

/** Node's own list (bundled + NODE_EXTRA_CA_CERTS), read before the first change replaces it. */
let nodeDefault: string[] | null = null
let applied: Promise<unknown> = Promise.resolve()

/** Requests wait for the latest settings to apply, so none goes out with the old list. */
export const certificatesApplied = (): Promise<unknown> => applied

/** Every certificate block in a PEM file; throws when there is none or one does not parse. */
export function pemCertificates(text: string): string[] {
  const blocks = text.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []
  if (!blocks.length) throw new Error('no PEM certificate (-----BEGIN CERTIFICATE-----) in the file')
  for (const pem of blocks) new X509Certificate(pem)
  return blocks
}

/** Takes a promise too, so requests made while the settings load still wait for them. */
export function applyCertificates(
  pending: CertificateSettings | Promise<CertificateSettings>
): Promise<CertificateStatus> {
  const run = (async (): Promise<CertificateStatus> => {
    const settings = await pending
    nodeDefault ??= tls.getCACertificates('default')
    const status: CertificateStatus = { ...settings, node: nodeDefault.length, systemCount: 0, fileCount: 0 }
    const certs = new Set(nodeDefault)
    if (settings.system) {
      try {
        const system = tls.getCACertificates('system')
        status.systemCount = system.length
        for (const c of system) certs.add(c)
      } catch (error) {
        status.error = `Cannot read the system certificate store: ${(error as Error).message}`
      }
    }
    const file = settings.caFile.trim()
    if (file) {
      try {
        const extra = pemCertificates(await readFile(file, 'utf8'))
        status.fileCount = extra.length
        for (const c of extra) certs.add(c)
      } catch (error) {
        status.error = `CA file ${file}: ${(error as Error).message}`
      }
    }
    tls.setDefaultCACertificates([...certs])
    return status
  })()
  applied = run.catch(() => {})
  return run
}
