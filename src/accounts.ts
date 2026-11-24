// Saved Backlog accounts and which one each Orca project uses. The list and the mapping live in
// the plugin's storage; each API key in its own encrypted secret.
import type { OrcaWorkerApi } from 'orca/worker'
import type { Credentials } from './backlog'
import type { Account } from './protocol'

const ACCOUNTS = 'accounts'
const PROJECT_ACCOUNTS = 'projectAccounts'
const LAST = 'lastAccount'
/** What 0.1 stored for its single login; moved into the list on first run. */
const LEGACY = { space: 'space', apiKey: 'apiKey' }

const secretKey = (id: string) => `apiKey.${id}`
export const accountId = (space: string, userId: number) => `${space}.${userId}`

export function accountStore(orca: OrcaWorkerApi) {
  const read = async <T>(key: string, fallback: T): Promise<T> => ((await orca.storage.get(key)) as T | null) ?? fallback

  const store = {
    list: () => read<Account[]>(ACCOUNTS, []),
    mapping: () => read<Record<string, string>>(PROJECT_ACCOUNTS, {}),
    last: () => read<string | null>(LAST, null),

    async creds(id: string): Promise<Credentials | null> {
      const account = (await store.list()).find((a) => a.id === id)
      const apiKey = account && (await orca.secrets.get(secretKey(id)))
      return account && apiKey ? { space: account.space, apiKey } : null
    },

    /** Adds or refreshes an account. */
    async save(account: Account, apiKey: string): Promise<void> {
      await orca.secrets.set(secretKey(account.id), apiKey)
      const others = (await store.list()).filter((a) => a.id !== account.id)
      await orca.storage.set(ACCOUNTS, [...others, account])
    },

    async remove(id: string): Promise<void> {
      await orca.secrets.delete(secretKey(id))
      await orca.storage.set(ACCOUNTS, (await store.list()).filter((a) => a.id !== id))
      const mapping = await store.mapping()
      await orca.storage.set(PROJECT_ACCOUNTS, Object.fromEntries(Object.entries(mapping).filter(([, a]) => a !== id)))
      if ((await store.last()) === id) await orca.storage.delete(LAST)
    },

    /** Remembers `id` as the last used and, when given, as the account of that Orca project. */
    async use(id: string, projectId: string | null): Promise<void> {
      await orca.storage.set(LAST, id)
      if (projectId) await store.map(projectId, id)
    },

    /** `accountId` empty: the project follows the last used account again. */
    async map(projectId: string, accountId: string): Promise<void> {
      const mapping = await store.mapping()
      if (accountId) mapping[projectId] = accountId
      else delete mapping[projectId]
      await orca.storage.set(PROJECT_ACCOUNTS, mapping)
    },

    /** The account an Orca project should use: its own, else the last used, else the first. */
    async pick(projectId: string | null): Promise<string | null> {
      const ids = new Set((await store.list()).map((a) => a.id))
      const mapped = projectId ? (await store.mapping())[projectId] : undefined
      const last = await store.last()
      return [mapped, last, ...ids].find((id): id is string => !!id && ids.has(id)) ?? null
    },

    /** The single login 0.1 saved, if any. */
    async legacy(): Promise<Credentials | null> {
      const space = await orca.storage.get(LEGACY.space)
      const apiKey = await orca.secrets.get(LEGACY.apiKey)
      return typeof space === 'string' && apiKey ? { space, apiKey } : null
    },

    async clearLegacy(): Promise<void> {
      await orca.storage.delete(LEGACY.space)
      await orca.secrets.delete(LEGACY.apiKey)
    }
  }
  return store
}
