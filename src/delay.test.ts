import assert from 'node:assert/strict'
import test from 'node:test'

import getPort from 'get-port'
import { Low, Memory } from 'lowdb'

import { createApp } from './app.ts'
import type { Data } from './service.ts'

async function start(delay?: number) {
  const db = new Low<Data>(new Memory<Data>(), {})
  db.data = { posts: [{ id: '1', title: 'foo' }] }
  const app = createApp(db, delay === undefined ? {} : { delay })
  const port = await getPort()
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(port, () => resolve(s))
  })
  test.after(() => server.close())
  return `http://localhost:${port}`
}

async function timedGet(url: string) {
  const start = performance.now()
  const res = await fetch(url)
  await res.text()
  return { status: res.status, elapsed: performance.now() - start }
}

await test('delay option', async (t) => {
  await t.test('waits at least the configured delay', async () => {
    const base = await start(200)
    const { status, elapsed } = await timedGet(`${base}/posts`)
    assert.equal(status, 200)
    // Allow 5ms of timer/clock imprecision
    assert.ok(elapsed >= 195, `expected >= 195ms, got ${elapsed}ms`)
  })

  await t.test('delays every request', async () => {
    const base = await start(100)
    for (let i = 0; i < 2; i++) {
      const { elapsed } = await timedGet(`${base}/posts/1`)
      assert.ok(elapsed >= 95, `expected >= 95ms, got ${elapsed}ms`)
    }
  })

  await t.test('has no delay by default', async () => {
    const base = await start()
    const { status, elapsed } = await timedGet(`${base}/posts`)
    assert.equal(status, 200)
    assert.ok(elapsed < 100, `expected < 100ms, got ${elapsed}ms`)
  })
})
