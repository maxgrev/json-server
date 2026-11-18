import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const bin = fileURLToPath(new URL('./bin.ts', import.meta.url))

function run(args: string[], file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', bin, ...args, file], {
      env: { ...process.env, PORT: '0', NODE_ENV: 'production' },
    })
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString()
      if (out.includes('Endpoints:')) {
        child.kill()
      }
    })
    child.on('error', reject)
    child.on('close', () => resolve(out))
  })
}

test('--quiet turns off the startup banner', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'json-server-')), 'db.json')
  writeFileSync(file, JSON.stringify({ posts: [] }))

  const loud = await run([], file)
  assert.match(loud, /JSON Server started/)

  const quiet = await run(['--quiet'], file)
  assert.doesNotMatch(quiet, /JSON Server started/)
  assert.match(quiet, /Endpoints:/)
})
