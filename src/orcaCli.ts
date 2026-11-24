// The installed agents and skills, as Orca itself resolves them (`orca agent installed`,
// `orca skills installed`), so the panel offers exactly what Orca would launch.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { cliEnv } from './platform'
import type { Option, SkillOption } from './protocol'

/** The CLI shipped beside the running Orca, else whatever `orca` is on PATH. */
function orcaBinary(): string {
  const exe = process.platform === 'win32' ? 'orca.exe' : 'orca'
  const candidates = [
    join(dirname(process.execPath), 'resources', 'bin', exe),
    join(dirname(process.execPath), '..', 'Resources', 'bin', exe)
  ]
  return candidates.find((path) => existsSync(path)) ?? 'orca'
}

function orcaJson<T>(args: string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    execFile(orcaBinary(), [...args, '--json'], { timeout: 20_000, windowsHide: true, maxBuffer: 8 << 20, env: cliEnv() }, (error, stdout) => {
      try {
        const parsed = JSON.parse(stdout) as { ok: boolean; result: T; error?: { message: string } }
        if (parsed.ok) resolve(parsed.result)
        else reject(new Error(parsed.error?.message ?? `orca ${args.join(' ')} failed`))
      } catch {
        reject(error ?? new Error(`orca ${args.join(' ')} printed no JSON`))
      }
    })
  })
}

export async function installedAgents(): Promise<{ agents: Option[]; defaultAgent: string | null }> {
  const { agents } = await orcaJson<{ agents: { id: string; name: string; default: boolean }[] }>([
    'agent',
    'installed'
  ])
  return {
    agents: agents.map((a) => ({ value: a.id, label: a.name })),
    defaultAgent: agents.find((a) => a.default)?.id ?? agents[0]?.id ?? null
  }
}

/** One option per skill name; `providers` merges every copy's agents. */
export async function installedSkills(): Promise<SkillOption[]> {
  const { skills } = await orcaJson<{ skills: { name: string; providers?: string[] }[] }>(['skills', 'installed'])
  const byName = new Map<string, SkillOption>()
  for (const skill of skills) {
    const entry = byName.get(skill.name) ?? { value: skill.name, label: skill.name, providers: [] }
    for (const p of skill.providers ?? []) if (!entry.providers.includes(p)) entry.providers.push(p)
    byName.set(skill.name, entry)
  }
  return [...byName.values()].sort((a, b) => a.label.localeCompare(b.label))
}
