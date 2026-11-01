   import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import getPort from 'get-port'
import { Low, Memory } from 'lowdb'
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

  await t.test('JSON Patch', async (t) => {
    const reset = () => {
      db.data = {
        posts: [{ id: '1', title: 'foo' }],
        comments: [{ id: '1', postId: '1' }],
        object: { f1: 'foo' },
      }
    }
    const patch = (url: string, body: unknown, contentType = 'application/json-patch+json') =>
      fetch(`http://localhost:${port}${url}`, {
        method: 'PATCH',
        headers: { 'Content-Type': contentType },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      })

    await t.test('PATCH /posts/1 replaces a field', async () => {
      reset()
      const response = await patch('/posts/1', [{ op: 'replace', path: '/title', value: 'x' }])
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { id: '1', title: 'x' })
      assert.deepEqual(db.data?.['posts'], [{ id: '1', title: 'x' }])
    })

    await t.test('PATCH /object adds a field', async () => {
      reset()
      const response = await patch('/object', [{ op: 'add', path: '/f2', value: { a: [1] } }])
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { f1: 'foo', f2: { a: [1] } })
    })

    await t.test('supports move, copy, test and remove', async () => {
      reset()
      const response = await patch('/posts/1', [
        { op: 'copy', from: '/title', path: '/copy' },
        { op: 'move', from: '/copy', path: '/moved' },
        { op: 'test', path: '/moved', value: 'foo' },
        { op: 'remove', path: '/title' },
      ])
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { id: '1', moved: 'foo' })
    })

    for (const contentType of [
      'application/json-patch+json; charset=utf-8',
      'Application/JSON-Patch+JSON',
    ]) {
      await t.test(`Content-Type "${contentType}" is treated as JSON Patch`, async () => {
        reset()
        const response = await patch(
          '/posts/1',
          [{ op: 'add', path: '/views', value: 1 }],
          contentType,
        )
        assert.equal(response.status, 200)
        assert.deepEqual(await response.json(), { id: '1', title: 'foo', views: 1 })
      })
    }

    await t.test('application/json still shallow merges', async () => {
      reset()
      const response = await patch('/posts/1', { views: 1 }, 'application/json')
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { id: '1', title: 'foo', views: 1 })
    })

    await t.test('application/json with array body returns 400', async () => {
      reset()
      const response = await patch(
        '/posts/1',
        [{ op: 'replace', path: '/title', value: 'x' }],
        'application/json',
      )
      assert.equal(response.status, 400)
      assert.deepEqual(await response.json(), { error: 'Body must be a JSON object' })
      assert.deepEqual(db.data?.['posts'], [{ id: '1', title: 'foo' }])
    })

    const malformed: [string, unknown][] = [
      ['body is not an array', { op: 'add', path: '/a', value: 1 }],
      ['unknown op', [{ op: 'bogus', path: '/a' }]],
      ['missing path', [{ op: 'add', value: 1 }]],
      ['empty body', ''],
    ]
    for (const [title, body] of malformed) {
      await t.test(`${title} returns 400`, async () => {
        reset()
        for (const url of ['/posts/1', '/object']) {
          const response = await patch(url, body)
          assert.equal(response.status, 400, `${url}`)
          const data = (await response.json()) as { error: unknown }
          assert.equal(typeof data.error, 'string')
        }
      })
    }

    await t.test('remove on a nonexistent path returns 422', async () => {
      reset()
      const response = await patch('/posts/1', [{ op: 'remove', path: '/nope' }])
      assert.equal(response.status, 422)
      const data = (await response.json()) as { error: unknown }
      assert.equal(typeof data.error, 'string')
    })

    await t.test('failing test op returns 422 and leaves data unchanged', async () => {
      reset()
      const response = await patch('/posts/1', [
        { op: 'replace', path: '/title', value: 'x' },
        { op: 'test', path: '/title', value: 'nope' },
      ])
      assert.equal(response.status, 422)
      assert.deepEqual(db.data?.['posts'], [{ id: '1', title: 'foo' }])
    })

    await t.test('replacing /id returns 422 and keeps the id', async () => {
      reset()
      const response = await patch('/posts/1', [{ op: 'replace', path: '/id', value: '2' }])
      assert.equal(response.status, 422)
      assert.deepEqual(db.data?.['posts'], [{ id: '1', title: 'foo' }])
    })

    await t.test('replacing the root of an object resource returns 422', async () => {
      reset()
      const response = await patch('/object', [{ op: 'replace', path: '', value: {} }])
      assert.equal(response.status, 422)
      assert.deepEqual(db.data?.['object'], { f1: 'foo' })
    })

    await t.test('missing item or resource returns 404', async () => {
      reset()
      for (const url of ['/posts/-1', '/posts', '/object/1', '/not-found']) {
        const response = await patch(url, [{ op: 'add', path: '/a', value: 1 }])
        assert.equal(response.status, 404, url)
        assert.deepEqual(await response.json(), { error: 'Not Found' })
      }
    })

    await t.test('OPTIONS preflight asking for content-type returns 204', async () => {
      const response = await fetch(`http://localhost:${port}/posts/1`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://example.com',
          'Access-Control-Request-Method': 'PATCH',
          'Access-Control-Request-Headers': 'content-type',
        },
      })
      assert.equal(response.status, 204)
      assert.match(response.headers.get('access-control-allow-headers') ?? '', /content-type/i)
    })
  })
})
