import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const binPath = fileURLToPath(new URL('./bin.ts', import.meta.url))
const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url))

await test('--version reads package.json, prints its version and exits 0', () => {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string }
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', binPath, '--version'],
    { encoding: 'utf-8' },
  )
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), pkg.version)
})
