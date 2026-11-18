import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

function run(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, ['--experimental-strip-types', 'src/bin.ts', ...args], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
    timeout: 10000,
  })
}

await test('bin', async (t) => {
  await t.test('exits 2 when db file is missing', () => {
    const result = run(['does-not-exist.json'])
    assert.equal(result.status, 2)
    assert.match(result.stderr, /File does-not-exist\.json not found/)
  })

  await t.test('exits 2 for non-numeric -p', () => {
    const result = run(['-p', 'abc', 'fixtures/db.json'])
    assert.equal(result.status, 2)
    assert.match(result.stderr, /Invalid port "abc"/)
  })

  await t.test('exits 2 for partially numeric -p', () => {
    const result = run(['-p', '30x0', 'fixtures/db.json'])
    assert.equal(result.status, 2)
    assert.match(result.stderr, /Invalid port "30x0"/)
  })

  await t.test('exits 2 for non-numeric PORT env', () => {
    const result = run(['fixtures/db.json'], { PORT: 'abc' })
    assert.equal(result.status, 2)
    assert.match(result.stderr, /Invalid port "abc"/)
  })
})
