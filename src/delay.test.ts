import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import getPort from 'get-port'
import { Low, Memory } from 'lowdb'
import { temporaryDirectory } from 'tempy'

import { createApp } from './app.ts'
import type { AppOptions } from './app.ts'
import type { Data } from './service.ts'

async function timedGet(options?: AppOptions): Promise<{ status: number; elapsed: number }> {
  const db = new Low<Data>(new Memory<Data>(), {})
  db.data = { posts: [{ id: '1', title: 'foo' }] }
  const app = createApp(db, options)
  const port = await getPort()
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(port, () => resolve(s))
  })
  try {
    const start = performance.now()
    const response = await fetch(`http://localhost:${port}/posts`)
    await response.json()
    return { status: response.status, elapsed: performance.now() - start }
  } finally {
    server.close()
  }
}

const DELAY = 200
// setTimeout may fire slightly early, allow a small tolerance
const TOLERANCE = 5

await test('delay', async (t) => {
  await t.test('waits at least the configured delay before answering', async () => {
    const { status, elapsed } = await timedGet({ delay: DELAY })
    assert.equal(status, 200)
    assert.ok(elapsed >= DELAY - TOLERANCE, `${elapsed}ms < ${DELAY}ms`)
  })

  await t.test('has no delay by default', async () => {
    const { status, elapsed } = await timedGet()
    assert.equal(status, 200)
    assert.ok(elapsed < DELAY, `${elapsed}ms >= ${DELAY}ms`)
  })

  await t.test('has no delay when set to 0', async () => {
    const { status, elapsed } = await timedGet({ delay: 0 })
    assert.equal(status, 200)
    assert.ok(elapsed < DELAY, `${elapsed}ms >= ${DELAY}ms`)
  })
})

await test('--delay CLI option', async (t) => {
  const bin = fileURLToPath(new URL('./bin.ts', import.meta.url))
  const file = join(temporaryDirectory(), 'db.json')
  writeFileSync(file, '{}')

  function run(...args: string[]) {
    return spawnSync(process.execPath, ['--experimental-strip-types', bin, ...args], {
      encoding: 'utf-8',
      timeout: 10000,
    })
  }

  for (const value of ['abc', '', '1x', 'NaN', 'Infinity']) {
    await t.test(`rejects --delay '${value}'`, () => {
      const result = run('--delay', value, file)
      assert.equal(result.status, 1)
      assert.match(result.stdout, /Invalid value for --delay/)
    })
  }

  await t.test('rejects --delay=-1', () => {
    const result = run('--delay=-1', file)
    assert.equal(result.status, 1)
    assert.match(result.stdout, /Invalid value for --delay/)
  })

  await t.test('rejects a negative value passed as a separate argument', () => {
    const result = run('--delay', '-1', file)
    assert.equal(result.status, 1)
    assert.match(result.stdout, /--delay/)
  })

  await t.test('is listed in --help', () => {
    const result = run('--help')
    assert.equal(result.status, 0)
    assert.match(result.stdout, /--delay <ms>/)
  })
})
