import assert from 'node:assert/strict'
import test from 'node:test'

import getPort from 'get-port'
import { Low, Memory } from 'lowdb'

import { createApp } from './app.ts'
import type { AppOptions } from './app.ts'
import type { Data } from './service.ts'

async function start(options: AppOptions) {
  const port = await getPort()
  const db = new Low<Data>(new Memory<Data>(), {})
  db.data = { posts: [{ id: '1', title: 'foo' }] }
  const app = createApp(db, options)
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(port, () => resolve(s))
  })
  test.after(() => server.close())
  return `http://localhost:${port}`
}

async function timeGet(url: string) {
  const start = performance.now()
  const response = await fetch(url)
  const elapsed = performance.now() - start
  return { response, elapsed }
}

const DELAY = 300

await test('delay option', async (t) => {
  const delayed = await start({ delay: DELAY })
  const immediate = await start({})

  await t.test('waits at least the configured delay before answering', async () => {
    // Allow 5ms for timer/clock rounding
    for (const path of ['/posts', '/posts/1']) {
      const { response, elapsed } = await timeGet(`${delayed}${path}`)
      assert.equal(response.status, 200)
      assert.ok(elapsed >= DELAY - 5, `${path} took ${elapsed}ms, expected >= ${DELAY}ms`)
    }
  })

  await t.test('delays non-GET requests', async () => {
    const begin = performance.now()
    const response = await fetch(`${delayed}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'bar' }),
    })
    const elapsed = performance.now() - begin
    assert.equal(response.status, 201)
    assert.ok(elapsed >= DELAY - 5, `POST took ${elapsed}ms, expected >= ${DELAY}ms`)
  })

  await t.test('has no delay by default', async () => {
    const { response, elapsed } = await timeGet(`${immediate}/posts`)
    assert.equal(response.status, 200)
    assert.ok(elapsed < DELAY, `request took ${elapsed}ms, expected < ${DELAY}ms`)
  })

  await t.test('has no delay when set to 0', async () => {
    const url = await start({ delay: 0 })
    const { response, elapsed } = await timeGet(`${url}/posts`)
    assert.equal(response.status, 200)
    assert.ok(elapsed < DELAY, `request took ${elapsed}ms, expected < ${DELAY}ms`)
  })
})
