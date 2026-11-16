import assert from 'node:assert/strict'
import test from 'node:test'

await test('flaky: fails on the first CI attempt', () => {
  assert.notEqual(
    process.env['GITHUB_RUN_ATTEMPT'],
    '1',
    'This test fails on purpose when GITHUB_RUN_ATTEMPT is "1" (the first CI attempt); re-run the job to make it pass.',
  )
})
