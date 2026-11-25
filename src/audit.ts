// Every change the plugin makes, to Backlog or on this computer, with the API that made it, so
// it can be traced later (Settings → Audit log). Kept in the plugin's storage; never an API key.
import type { OrcaWorkerApi } from 'orca/worker'
import type { AuditEntry } from './protocol'

const AUDIT = 'auditLog'
export const MAX_AUDIT = 500
/** Free text (comments, prompts) is cut here: enough to recognise it, not a copy of it. */
const EXCERPT = 80

export type AuditInput = Omit<AuditEntry, 'id' | 'at' | 'ok' | 'error'>

export const excerpt = (text: string) => {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > EXCERPT ? `${line.slice(0, EXCERPT - 1)}…` : line
}

export function auditLog(orca: OrcaWorkerApi) {
  // One write at a time: two changes at once must not drop each other's entry.
  let queue: Promise<unknown> = Promise.resolve()
  let counter = 0
  const list = async () => ((await orca.storage.get(AUDIT)) as AuditEntry[] | null) ?? []
  const write = (update: (all: AuditEntry[]) => AuditEntry[]) => {
    const next = queue.then(async () => orca.storage.set(AUDIT, update(await list()).slice(0, MAX_AUDIT)))
    queue = next.catch((e) => orca.log(`audit log: ${(e as Error).message}`))
    return queue
  }
  const entry = (input: AuditInput, ok: boolean, error?: string): AuditEntry => ({
    id: `${Date.now().toString(36)}-${(counter++).toString(36)}`,
    at: Date.now(),
    ...input,
    ok,
    ...(error ? { error } : {})
  })

  return {
    /** Newest first. */
    list: async () => (await queue, list()),

    record: (input: AuditInput, ok = true, error?: string) => write((all) => [entry(input, ok, error), ...all]),

    /**
     * Runs a change and records it, failed ones too. `describe` adds what only the result knows
     * (the workspace, the API that was used).
     */
    async track<T>(input: AuditInput, run: () => Promise<T>, describe?: (result: T) => Partial<AuditInput>): Promise<T> {
      try {
        const result = await run()
        await write((all) => [entry({ ...input, ...describe?.(result) }, true), ...all])
        return result
      } catch (error) {
        await write((all) => [entry(input, false, (error as Error).message), ...all])
        throw error
      }
    },

    /** Empties the log, leaving the entry that says so. */
    clear: (removed: number) =>
      write(() => [entry({ action: 'Cleared the audit log', api: 'plugin storage', details: `${removed} entries` }, true)])
  }
}
