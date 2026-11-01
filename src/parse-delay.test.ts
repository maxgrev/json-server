import assert from 'node:assert/strict'
import test from 'node:test'

import { parseDelay } from './parse-delay.ts'

await test('parseDelay', async (t) => {
  await t.test('accepts non-negative numbers', () => {
    assert.equal(parseDelay('0'), 0)
    assert.equal(parseDelay('250'), 250)
    assert.equal(parseDelay('1.5'), 1.5)
  })

  await t.test('rejects negative values', () => {
    assert.throws(() => parseDelay('-1'), /Invalid --delay value "-1"/)
  })

  await t.test('rejects non-numeric values', () => {
    for (const value of ['abc', '', ' ', '10ms', 'NaN', 'Infinity']) {
      assert.throws(() => parseDelay(value), /Invalid --delay value/)
    }
  })
})
