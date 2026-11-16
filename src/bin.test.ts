import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const binPath = fileURLToPath(new URL('./bin.ts', import.meta.url))
const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url))

await test('--version prints the version from package.json', () => {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string }
  const stdout = execFileSync(
    process.execPath,
    ['--experimental-strip-types', binPath, '--version'],
    { encoding: 'utf-8' },
  )
  assert.equal(stdout.trim(), pkg.version)
})
