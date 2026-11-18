import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { temporaryDirectory } from 'tempy'

const binPath = fileURLToPath(new URL('./bin.ts', import.meta.url))

type CliResult = {
  status: number | null
  stdout: string
  stderr: string
}

// Run the CLI with the given arguments and wait for it to exit.
// Reusable by other tests; the process must exit on its own (don't start a server).
function runCli(args: string[], env: NodeJS.ProcessEnv = {}): CliResult {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', binPath, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1', ...env },
    timeout: 10_000,
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

await test('missing db file: error on stderr, exit code 2', () => {
  const file = join(temporaryDirectory(), 'does-not-exist.json')
  const { status, stdout, stderr } = runCli([file])

  assert.equal(status, 2)
  assert.ok(stderr.includes('not found'), stderr)
  assert.ok(stderr.includes(file), stderr)
  assert.ok(!stdout.includes('not found'), stdout)
  assert.ok(!stdout.includes(file), stdout)
})
