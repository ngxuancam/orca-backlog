import { mkdtemp, mkdir, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assert, test } from 'orca/testing'
import { pruneCache } from './files'

const DAY = 24 * 60 * 60 * 1000

/** A preview folder per issue, each file last used `daysAgo` days ago. */
async function cache(issues: Record<string, { daysAgo: number; bytes: number }>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orca-backlog-prune-'))
  await writeFile(join(dir, '.gitignore'), '*\n')
  for (const [key, { daysAgo, bytes }] of Object.entries(issues)) {
    await mkdir(join(dir, key))
    const file = join(dir, key, 'shot.png')
    await writeFile(file, Buffer.alloc(bytes))
    const at = new Date(Date.now() - daysAgo * DAY)
    await utimes(file, at, at)
  }
  return dir
}

test('drops previews unused for a week and keeps the .gitignore', async () => {
  const dir = await cache({ 'APP-1': { daysAgo: 0, bytes: 10 }, 'APP-2': { daysAgo: 3, bytes: 10 }, 'APP-3': { daysAgo: 9, bytes: 10 } })
  assert.equal(await pruneCache(dir), 1)
  assert.deepEqual((await readdir(dir)).sort(), ['.gitignore', 'APP-1', 'APP-2'])
  await rm(dir, { recursive: true, force: true })
})

test('stays under the size cap, oldest first, never the newest', async () => {
  const dir = await cache({ new: { daysAgo: 0, bytes: 600 }, mid: { daysAgo: 1, bytes: 300 }, old: { daysAgo: 2, bytes: 300 } })
  assert.equal(await pruneCache(dir, { maxBytes: 1000 }), 1)
  assert.deepEqual((await readdir(dir)).sort(), ['.gitignore', 'mid', 'new'])
  // A single folder over the cap is still kept while it is the newest.
  assert.equal(await pruneCache(dir, { maxBytes: 100 }), 1)
  assert.deepEqual((await readdir(dir)).sort(), ['.gitignore', 'new'])
  await rm(dir, { recursive: true, force: true })
})

test('a missing folder is fine', async () => {
  assert.equal(await pruneCache(join(tmpdir(), 'orca-backlog-does-not-exist')), 0)
})
