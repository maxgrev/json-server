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

const dbFile = fileURLToPath(new URL('../fixtures/db.json', import.meta.url))

function assertInvalidPort(result: CliResult, value: string) {
  assert.equal(result.status, 2)
  assert.ok(
    result.stderr.includes(`Error: invalid port "${value}", must be a number between 0 and 65535`),
    result.stderr,
  )
  assert.equal(result.stdout, '')
}

await test('invalid port -p abc: error on stderr, exit code 2', () => {
  assertInvalidPort(runCli(['-p', 'abc', dbFile]), 'abc')
})

await test('invalid port -p 3000abc: error on stderr, exit code 2', () => {
  assertInvalidPort(runCli(['-p', '3000abc', dbFile]), '3000abc')
})

await test('invalid port -p 70000: error on stderr, exit code 2', () => {
  assertInvalidPort(runCli(['-p', '70000', dbFile]), '70000')
})

await test('invalid PORT env without -p: error on stderr, exit code 2', () => {
  assertInvalidPort(runCli([dbFile], { PORT: 'abc' }), 'abc')
})

await test('valid port is not rejected', () => {
  const file = join(temporaryDirectory(), 'does-not-exist.json')
  const { status, stderr } = runCli(['-p', '3000', file])

  // Fails later, on the missing db file, so no server is started.
  assert.equal(status, 2)
  assert.ok(stderr.includes('database file'), stderr)
  assert.ok(!stderr.includes('invalid port'), stderr)
})
