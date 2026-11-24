// Orca starts plugin workers with a trimmed environment (no APPDATA on Windows): rebuild the
// per-user folders from the home directory when they are missing.
import { homedir } from 'node:os'
import { join } from 'node:path'

export function appDataDir(): string {
  const home = homedir()
  if (process.platform === 'win32') return process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
  if (process.platform === 'darwin') return join(home, 'Library', 'Application Support')
  return process.env.XDG_CONFIG_HOME ?? join(home, '.config')
}

/** What the `orca` CLI needs to find the running Orca. */
export function cliEnv(): NodeJS.ProcessEnv {
  const home = homedir()
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: process.env.HOME ?? home }
  if (process.platform === 'win32') {
    env.USERPROFILE ??= home
    env.APPDATA ??= join(home, 'AppData', 'Roaming')
    env.LOCALAPPDATA ??= join(home, 'AppData', 'Local')
  }
  return env
}
