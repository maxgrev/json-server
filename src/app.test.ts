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

  await t.test('PATCH /posts/:id with JSON Patch', async (t) => {
    const url = `http://localhost:${port}/posts/1`
    const reset = () => {
      db.data = {
        posts: [{ id: '1', title: 'foo', tags: ['a'] }],
        comments: [{ id: '1', postId: '1' }],
        object: { f1: 'foo' },
      }
    }
    const patch = (body: unknown, contentType = 'application/json-patch+json') =>
      fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': contentType },
        body: JSON.stringify(body),
      })

    await t.test('applies operations and stores the result', async () => {
      reset()
      const response = await patch([
        { op: 'test', path: '/title', value: 'foo' },
        { op: 'replace', path: '/title', value: 'bar' },
        { op: 'add', path: '/tags/-', value: 'b' },
        { op: 'add', path: '/views', value: 1 },
      ])
      assert.equal(response.status, 200)
      const expected = { id: '1', title: 'bar', tags: ['a', 'b'], views: 1 }
      assert.deepEqual(await response.json(), expected)
      assert.deepEqual(db.data['posts'], [expected])
      const get = await fetch(url)
      assert.deepEqual(await get.json(), expected)
    })

    await t.test('accepts content type parameters and any case', async () => {
      reset()
      const response = await patch(
        [{ op: 'remove', path: '/tags' }],
        'Application/JSON-Patch+JSON; charset=utf-8',
      )
      assert.equal(response.status, 200)
      assert.deepEqual(db.data['posts'], [{ id: '1', title: 'foo' }])
    })

    await t.test('application/json still merges', async () => {
      reset()
      const response = await patch({ title: 'merged' }, 'application/json')
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { id: '1', title: 'merged', tags: ['a'] })
      assert.deepEqual(db.data['posts'], [{ id: '1', title: 'merged', tags: ['a'] }])
    })

    await t.test('application/json with an array body still returns 400', async () => {
      reset()
      const response = await patch([{ op: 'remove', path: '/title' }], 'application/json')
      assert.equal(response.status, 400)
      assert.deepEqual(db.data['posts'], [{ id: '1', title: 'foo', tags: ['a'] }])
    })

    const invalid: [string, unknown][] = [
      ['an object instead of an array', { title: 'bar' }],
      ['an unknown op', [{ op: 'nope', path: '/title' }]],
      ['a missing value', [{ op: 'add', path: '/title' }]],
      ['an invalid pointer', [{ op: 'remove', path: 'title' }]],
      [
        'a failed test operation',
        [
          { op: 'replace', path: '/title', value: 'bar' },
          { op: 'test', path: '/title', value: 'nope' },
        ],
      ],
      [
        'a failing operation after successful ones',
        [
          { op: 'replace', path: '/title', value: 'bar' },
          { op: 'remove', path: '/missing' },
        ],
      ],
      ['a result that is not an object', [{ op: 'replace', path: '', value: [1] }]],
      ['an id change', [{ op: 'replace', path: '/id', value: '2' }]],
    ]
    for (const [name, body] of invalid) {
      await t.test(`returns 422 and changes nothing for ${name}`, async () => {
        reset()
        const response = await patch(body)
        assert.equal(response.status, 422)
        const data = (await response.json()) as { error: unknown }
        assert.equal(typeof data.error, 'string')
        assert.deepEqual(db.data['posts'], [{ id: '1', title: 'foo', tags: ['a'] }])
      })
    }

    await t.test('returns 404 for a missing item', async () => {
      reset()
      const response = await fetch(`http://localhost:${port}/posts/-1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json-patch+json' },
        body: JSON.stringify([{ op: 'replace', path: '/title', value: 'bar' }]),
      })
      assert.equal(response.status, 404)
      assert.deepEqual(await response.json(), { error: 'Not Found' })
    })

    await t.test('returns 404 for an unknown resource', async () => {
      const response = await fetch(`http://localhost:${port}/not-found/1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json-patch+json' },
        body: JSON.stringify([]),
      })
      assert.equal(response.status, 404)
    })
  })
})
