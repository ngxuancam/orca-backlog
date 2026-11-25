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

function orcaJson<T>(args: string[], timeout = 20_000): Promise<T> {
  return new Promise((resolve, reject) => {
    execFile(orcaBinary(), [...args, '--json'], { timeout, windowsHide: true, maxBuffer: 8 << 20, env: cliEnv() }, (error, stdout) => {
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

/** Where an agent starts: an existing workspace, or a new worktree of a project. */
export type LaunchTarget = { workspaceId: string } | { projectId: string; hostId?: string; name: string }

/** Windows caps a command line near 32K characters; longer prompts go through the host API. */
export const MAX_CLI_PROMPT = 24_000

/**
 * Starts an agent with its first message the way Orca's own new agent tab does, and shows it.
 * The host API's `agent.launch` opens the agent but can drop the prompt (Orca 1.4.272), so the
 * CLI, which starts the agent and submits the prompt as one launch, is used instead.
 */
export async function launchWithPrompt(target: LaunchTarget, agent: string, prompt: string): Promise<{ workspaceId: string }> {
  if ('workspaceId' in target) {
    const { workspaceId } = target
    const worktree = workspaceId.startsWith('folder:') ? workspaceId : `id:${workspaceId}`
    await orcaJson(['agent', 'launch', '--agent', agent, '--worktree', worktree, '--prompt', prompt, '--focus'], 120_000)
    return { workspaceId }
  }
  const { projectId, hostId, name } = target
  const result = await orcaJson<{ worktree?: { id?: string }; worktreeId?: string }>(
    [
      'worktree',
      'create',
      '--project',
      projectId,
      ...(hostId ? ['--host', hostId] : []),
      '--name',
      name,
      '--agent',
      agent,
      '--prompt',
      prompt,
      '--activate'
    ],
    300_000
  )
  return { workspaceId: result.worktree?.id ?? result.worktreeId ?? '' }
}

/** What the worker launches with; tests swap it to keep the real CLI out. */
export const cliLauncher = { launchWithPrompt }
