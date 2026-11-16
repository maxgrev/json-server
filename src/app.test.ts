   import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import getPort from 'get-port'
import { Low, Memory } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import { temporaryDirectory } from 'tempy'

import { createApp } from './app.ts'
import type { Data } from './service.ts'

type Test = {
  method: HTTPMethods
  url: string
  statusCode: number
}

type HTTPMethods = 'DELETE' | 'GET' | 'HEAD' | 'PATCH' | 'POST' | 'PUT' | 'OPTIONS'

const port = await getPort()

// Create custom static dir with an html file
const tmpDir = temporaryDirectory()
const file = 'file.html'
writeFileSync(join(tmpDir, file), 'utf-8')

// Create app
const db = new Low<Data>(new Memory<Data>(), {})
db.data = {
  posts: [{ id: '1', title: 'foo' }],
  comments: [{ id: '1', postId: '1' }],
  object: { f1: 'foo' },
}
const app = createApp(db, { static: [tmpDir] })

await new Promise<void>((resolve, reject) => {
  try {
    const server = app.listen(port, () => resolve())
    test.after(() => server.close())
  } catch (err) {
    reject(err)
  }
})

await test('createApp', async (t) => {
  // URLs
  const POSTS = '/posts'
  const POSTS_WITH_COMMENTS = '/posts?_embed=comments'
  const POST_1 = '/posts/1'
  const POST_NOT_FOUND = '/posts/-1'
  const POST_WITH_COMMENTS = '/posts/1?_embed=comments'
  const COMMENTS = '/comments'
  const POST_COMMENTS = '/comments?postId=1'
  const NOT_FOUND = '/not-found'
  const OBJECT = '/object'
  const OBJECT_1 = '/object/1'

  const arr: Test[] = [
    // Static
    { method: 'GET', url: '/', statusCode: 200 },
    { method: 'GET', url: '/test.html', statusCode: 200 },
    { method: 'GET', url: `/${file}`, statusCode: 200 },

    // CORS
    { method: 'OPTIONS', url: POSTS, statusCode: 204 },

    // API
    { method: 'GET', url: POSTS, statusCode: 200 },
    { method: 'GET', url: POSTS_WITH_COMMENTS, statusCode: 200 },
    { method: 'GET', url: POST_1, statusCode: 200 },
    { method: 'GET', url: POST_NOT_FOUND, statusCode: 404 },
    { method: 'GET', url: POST_WITH_COMMENTS, statusCode: 200 },
    { method: 'GET', url: COMMENTS, statusCode: 200 },
    { method: 'GET', url: POST_COMMENTS, statusCode: 200 },
    { method: 'GET', url: OBJECT, statusCode: 200 },
    { method: 'GET', url: OBJECT_1, statusCode: 404 },
    { method: 'GET', url: NOT_FOUND, statusCode: 404 },

    { method: 'POST', url: POSTS, statusCode: 201 },
    { method: 'POST', url: POST_1, statusCode: 404 },
    { method: 'POST', url: POST_NOT_FOUND, statusCode: 404 },
    { method: 'POST', url: OBJECT, statusCode: 404 },
    { method: 'POST', url: OBJECT_1, statusCode: 404 },
    { method: 'POST', url: NOT_FOUND, statusCode: 404 },

    { method: 'PUT', url: POSTS, statusCode: 404 },
    { method: 'PUT', url: POST_1, statusCode: 200 },
    { method: 'PUT', url: OBJECT, statusCode: 200 },
    { method: 'PUT', url: OBJECT_1, statusCode: 404 },
    { method: 'PUT', url: POST_NOT_FOUND, statusCode: 404 },
    { method: 'PUT', url: NOT_FOUND, statusCode: 404 },

    { method: 'PATCH', url: POSTS, statusCode: 404 },
    { method: 'PATCH', url: POST_1, statusCode: 200 },
    { method: 'PATCH', url: OBJECT, statusCode: 200 },
    { method: 'PATCH', url: OBJECT_1, statusCode: 404 },
    { method: 'PATCH', url: POST_NOT_FOUND, statusCode: 404 },
    { method: 'PATCH', url: NOT_FOUND, statusCode: 404 },

    { method: 'DELETE', url: POSTS, statusCode: 404 },
    { method: 'DELETE', url: POST_1, statusCode: 200 },
    { method: 'DELETE', url: OBJECT, statusCode: 404 },
    { method: 'DELETE', url: OBJECT_1, statusCode: 404 },
    { method: 'DELETE', url: POST_NOT_FOUND, statusCode: 404 },
    { method: 'DELETE', url: NOT_FOUND, statusCode: 404 },
  ]

  for (const tc of arr) {
    await t.test(`${tc.method} ${tc.url}`, async () => {
      const response = await fetch(`http://localhost:${port}${tc.url}`, {
        method: tc.method,
      })
      assert.equal(
        response.status,
        tc.statusCode,
        `${response.status} !== ${tc.statusCode} ${tc.method} ${tc.url} failed`,
      )
      if (tc.statusCode === 404) {
        const body = await response.json()
        assert.deepEqual(body, { error: 'Not Found' })
      }
    })
  }

  await t.test('GET /posts?_where=... uses JSON query', async () => {
    // Reset data since previous tests may have modified it
    db.data = {
      posts: [{ id: '1', title: 'foo' }],
      comments: [{ id: '1', postId: '1' }],
      object: { f1: 'foo' },
    }
    const where = encodeURIComponent(JSON.stringify({ title: { eq: 'foo' } }))
    const response = await fetch(`http://localhost:${port}/posts?_where=${where}`)
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.deepEqual(data, [{ id: '1', title: 'foo' }])
  })

  await t.test('GET /posts?_where=... overrides query params', async () => {
    const where = encodeURIComponent(JSON.stringify({ title: { eq: 'foo' } }))
    const response = await fetch(
      `http://localhost:${port}/posts?title:eq=bar&_where=${where}`,
    )
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.deepEqual(data, [{ id: '1', title: 'foo' }])
  })

  await t.test('POST /posts with array body returns 400', async () => {
    const response = await fetch(`http://localhost:${port}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ title: 'foo' }]),
    })
    assert.equal(response.status, 400)
    const data = await response.json()
    assert.deepEqual(data, { error: 'Body must be a JSON object' })
  })

  await t.test('PATCH /posts/1 with string body returns 400', async () => {
    const response = await fetch(`http://localhost:${port}/posts/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify('hello'),
    })
    assert.equal(response.status, 400)
    const data = await response.json()
    assert.deepEqual(data, { error: 'Body must be a JSON object' })
  })

  await t.test('PUT /posts/1 with null body returns 400', async () => {
    const response = await fetch(`http://localhost:${port}/posts/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(null),
    })
    assert.equal(response.status, 400)
    const data = await response.json()
    assert.deepEqual(data, { error: 'Body must be a JSON object' })
  })

  await t.test('GET / does not say read-only when readOnly is off', async () => {
    const response = await fetch(`http://localhost:${port}/`)
    assert.equal(response.status, 200)
    assert.doesNotMatch(await response.text(), /read-only/i)
  })
})

await test('createApp with readOnly', async (t) => {
  const readOnlyPort = await getPort()
  const dbFile = join(temporaryDirectory(), 'db.json')
  const initial = JSON.stringify({
    posts: [{ id: '1', title: 'foo' }],
    comments: [{ id: '1', postId: '1' }],
    object: { f1: 'foo' },
  })
  writeFileSync(dbFile, initial)

  const readOnlyDb = new Low<Data>(new JSONFile<Data>(dbFile), {})
  await readOnlyDb.read()
  const readOnlyApp = createApp(readOnlyDb, { readOnly: true })

  await new Promise<void>((resolve) => {
    const server = readOnlyApp.listen(readOnlyPort, () => resolve())
    t.after(() => server.close())
  })

  const base = `http://localhost:${readOnlyPort}`
  const urls = ['/', '/posts', '/posts/1', '/object', '/object/1', '/not-found']
  const writeMethods: HTTPMethods[] = ['POST', 'PUT', 'PATCH', 'DELETE']

  for (const method of writeMethods) {
    for (const url of urls) {
      await t.test(`${method} ${url} returns 405`, async () => {
        const response = await fetch(`${base}${url}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'bar' }),
        })
        assert.equal(response.status, 405)
        assert.equal(response.headers.get('allow'), 'GET, HEAD, OPTIONS')
        assert.deepEqual(await response.json(), { error: 'This server is read-only' })
        assert.equal(readFileSync(dbFile, 'utf-8'), initial)
        assert.deepEqual(readOnlyDb.data, JSON.parse(initial))
      })
    }
  }

  await t.test('DELETE /posts/1?_dependent=comments returns 405', async () => {
    const response = await fetch(`${base}/posts/1?_dependent=comments`, {
      method: 'DELETE',
    })
    assert.equal(response.status, 405)
    assert.equal(readFileSync(dbFile, 'utf-8'), initial)
  })

  const readTests: Test[] = [
    { method: 'GET', url: '/', statusCode: 200 },
    { method: 'GET', url: '/posts', statusCode: 200 },
    { method: 'GET', url: '/posts/1', statusCode: 200 },
    { method: 'GET', url: '/not-found', statusCode: 404 },
    { method: 'HEAD', url: '/', statusCode: 200 },
    { method: 'OPTIONS', url: '/posts', statusCode: 204 },
  ]

  for (const tc of readTests) {
    await t.test(`${tc.method} ${tc.url} still works`, async () => {
      const response = await fetch(`${base}${tc.url}`, { method: tc.method })
      assert.equal(response.status, tc.statusCode)
    })
  }

  await t.test('GET / says the server is read-only', async () => {
    const response = await fetch(`${base}/`)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /read-only/)
  })

  await t.test('405 response carries CORS headers', async () => {
    const response = await fetch(`${base}/posts`, { method: 'POST' })
    assert.equal(response.status, 405)
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
  })

  await t.test('POST on a static file returns 405', async () => {
    const response = await fetch(`${base}/test.html`, { method: 'POST' })
    assert.equal(response.status, 405)
  })
})
