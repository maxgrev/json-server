import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import getPort from 'get-port'
import { temporaryDirectory } from 'tempy'

const bin = fileURLToPath(new URL('./bin.ts', import.meta.url))
const nodeArgs = ['--experimental-strip-types', '--no-warnings', bin]
const env = { ...process.env, NODE_ENV: 'production', FORCE_COLOR: '0' }

await test('--help lists --read-only', () => {
  const { stdout, status } = spawnSync(process.execPath, [...nodeArgs, '--help'], {
    encoding: 'utf-8',
    env,
  })
  assert.equal(status, 0)
  assert.match(stdout, /--read-only/)
})

await test('json-server --read-only db.json', async (t) => {
  const port = await getPort()
  const dbFile = join(temporaryDirectory(), 'db.json')
  const initial = JSON.stringify({ posts: [{ id: '1', title: 'foo' }] })
  writeFileSync(dbFile, initial)

  const child = spawn(
    process.execPath,
    [...nodeArgs, '--read-only', '--port', String(port), dbFile],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  t.after(() => child.kill())

  // Wait for the startup lines, which end with the list of endpoints
  let output = ''
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`CLI did not start in time:\n${output}`)),
      10_000,
    )
    const done = (fn: () => void) => {
      clearTimeout(timer)
      fn()
    }
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      if (output.includes('Endpoints:')) done(resolve)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.on('error', (e) => done(() => reject(e)))
    child.on('exit', (code) =>
      done(() => reject(new Error(`CLI exited with code ${code}:\n${output}`))),
    )
  })

  const base = `http://localhost:${port}`

  await t.test('startup lines say writes are off', () => {
    assert.match(output, /Read-only mode: writes are off/)
  })

  await t.test('POST /posts returns 405 with the JSON error shape', async () => {
    const response = await fetch(`${base}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'bar' }),
    })
    assert.equal(response.status, 405)
    assert.match(response.headers.get('content-type') ?? '', /application\/json/)
    assert.deepEqual(await response.json(), { error: 'This server is read-only' })
    assert.equal(readFileSync(dbFile, 'utf-8'), initial)
  })

  await t.test('GET /posts still returns 200', async () => {
    const response = await fetch(`${base}/posts`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), [{ id: '1', title: 'foo' }])
  })
})
