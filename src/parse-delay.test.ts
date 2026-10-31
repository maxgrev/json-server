import assert from 'node:assert/strict'
import test from 'node:test'

import { parseDelay } from './parse-delay.ts'

await test('parseDelay', async (t) => {
  await t.test('parses valid values', () => {
    assert.equal(parseDelay('0'), 0)
    assert.equal(parseDelay('500'), 500)
    assert.equal(parseDelay(' 250 '), 250)
  })

  await t.test('rejects negative, non-numeric and out of range values', () => {
    for (const value of ['-1', 'abc', '', ' ', '1s', 'NaN', 'Infinity', '99999999999']) {
      assert.throws(() => parseDelay(value), /Invalid --delay value/, value)
    }
  })
})
