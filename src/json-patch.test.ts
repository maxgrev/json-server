import assert from 'node:assert/strict'
import test from 'node:test'

import { applyJsonPatch, JsonPatchError, parsePointer, type Json } from './json-patch.ts'

function fails(doc: Json, patch: unknown) {
  assert.throws(() => applyJsonPatch(doc, patch), JsonPatchError)
}

await test('parsePointer', () => {
  assert.deepEqual(parsePointer(''), [])
  assert.deepEqual(parsePointer('/'), [''])
  assert.deepEqual(parsePointer('/a/b'), ['a', 'b'])
  assert.deepEqual(parsePointer('/a~1b/m~0n'), ['a/b', 'm~n'])
  assert.deepEqual(parsePointer('/~01'), ['~1'])
  assert.throws(() => parsePointer('a'), JsonPatchError)
  assert.throws(() => parsePointer('/a~2'), JsonPatchError)
  assert.throws(() => parsePointer('/a~'), JsonPatchError)
})

await test('add', async (t) => {
  await t.test('object member', () => {
    assert.deepEqual(applyJsonPatch({ a: 1 }, [{ op: 'add', path: '/b', value: 2 }]), {
      a: 1,
      b: 2,
    })
  })
  await t.test('overwrites existing member', () => {
    assert.deepEqual(applyJsonPatch({ a: 1 }, [{ op: 'add', path: '/a', value: 2 }]), { a: 2 })
  })
  await t.test('nested member', () => {
    assert.deepEqual(applyJsonPatch({ a: { b: 1 } }, [{ op: 'add', path: '/a/c', value: [] }]), {
      a: { b: 1, c: [] },
    })
  })
  await t.test('array insert', () => {
    assert.deepEqual(applyJsonPatch([1, 3], [{ op: 'add', path: '/1', value: 2 }]), [1, 2, 3])
    assert.deepEqual(applyJsonPatch([1, 2], [{ op: 'add', path: '/0', value: 0 }]), [0, 1, 2])
    assert.deepEqual(applyJsonPatch([1, 2], [{ op: 'add', path: '/2', value: 3 }]), [1, 2, 3])
  })
  await t.test('"-" appends to array', () => {
    assert.deepEqual(
      applyJsonPatch({ tags: ['a'] }, [
        { op: 'add', path: '/tags/-', value: 'b' },
        { op: 'add', path: '/tags/-', value: 'c' },
      ]),
      { tags: ['a', 'b', 'c'] },
    )
  })
  await t.test('replaces root', () => {
    assert.deepEqual(applyJsonPatch({ a: 1 }, [{ op: 'add', path: '', value: [1] }]), [1])
  })
  await t.test('errors', () => {
    fails([1], [{ op: 'add', path: '/2', value: 1 }])
    fails([1], [{ op: 'add', path: '/-1', value: 1 }])
    fails([1], [{ op: 'add', path: '/01', value: 1 }])
    fails([1], [{ op: 'add', path: '/x', value: 1 }])
    fails({ a: 1 }, [{ op: 'add', path: '/x/y', value: 1 }])
    fails({ a: 1 }, [{ op: 'add', path: '/a/y', value: 1 }])
    fails({ a: 1 }, [{ op: 'add', path: '/a/-', value: 1 }])
    fails({ a: 1 }, [{ op: 'add', path: '/b' }])
  })
})

await test('remove', async (t) => {
  await t.test('object member', () => {
    assert.deepEqual(applyJsonPatch({ a: 1, b: 2 }, [{ op: 'remove', path: '/a' }]), { b: 2 })
  })
  await t.test('array element', () => {
    assert.deepEqual(applyJsonPatch({ a: [1, 2, 3] }, [{ op: 'remove', path: '/a/1' }]), {
      a: [1, 3],
    })
  })
  await t.test('errors', () => {
    fails({ a: 1 }, [{ op: 'remove', path: '/b' }])
    fails({ a: [1] }, [{ op: 'remove', path: '/a/1' }])
    fails({ a: [1] }, [{ op: 'remove', path: '/a/-' }])
    fails({ a: 1 }, [{ op: 'remove', path: '' }])
  })
})

await test('replace', async (t) => {
  await t.test('object member', () => {
    assert.deepEqual(applyJsonPatch({ a: 1 }, [{ op: 'replace', path: '/a', value: 'x' }]), {
      a: 'x',
    })
  })
  await t.test('array element', () => {
    assert.deepEqual(applyJsonPatch([1, 2], [{ op: 'replace', path: '/1', value: 5 }]), [1, 5])
  })
  await t.test('root', () => {
    assert.equal(applyJsonPatch({ a: 1 }, [{ op: 'replace', path: '', value: 'x' }]), 'x')
  })
  await t.test('errors', () => {
    fails({ a: 1 }, [{ op: 'replace', path: '/b', value: 1 }])
    fails([1], [{ op: 'replace', path: '/1', value: 1 }])
    fails([1], [{ op: 'replace', path: '/-', value: 1 }])
  })
})

await test('move', async (t) => {
  await t.test('object member', () => {
    assert.deepEqual(
      applyJsonPatch({ a: { b: 1 }, c: {} }, [{ op: 'move', from: '/a/b', path: '/c/d' }]),
      { a: {}, c: { d: 1 } },
    )
  })
  await t.test('array element', () => {
    assert.deepEqual(applyJsonPatch([1, 2, 3], [{ op: 'move', from: '/0', path: '/2' }]), [2, 3, 1])
    assert.deepEqual(applyJsonPatch([1, 2, 3], [{ op: 'move', from: '/2', path: '/0' }]), [3, 1, 2])
  })
  await t.test('same location is a no-op', () => {
    assert.deepEqual(applyJsonPatch({ a: 1 }, [{ op: 'move', from: '/a', path: '/a' }]), { a: 1 })
  })
  await t.test('errors', () => {
    fails({ a: 1 }, [{ op: 'move', from: '/b', path: '/c' }])
    fails({ a: { b: 1 } }, [{ op: 'move', from: '/a', path: '/a/b' }])
    fails({ a: 1 }, [{ op: 'move', path: '/c' }])
  })
})

await test('copy', async (t) => {
  await t.test('copies a value', () => {
    assert.deepEqual(applyJsonPatch({ a: { b: 1 } }, [{ op: 'copy', from: '/a', path: '/c' }]), {
      a: { b: 1 },
      c: { b: 1 },
    })
  })
  await t.test('copy is independent of the source', () => {
    assert.deepEqual(
      applyJsonPatch({ a: { b: 1 } }, [
        { op: 'copy', from: '/a', path: '/c' },
        { op: 'replace', path: '/c/b', value: 2 },
      ]),
      { a: { b: 1 }, c: { b: 2 } },
    )
  })
  await t.test('errors', () => {
    fails({ a: 1 }, [{ op: 'copy', from: '/b', path: '/c' }])
    fails({ a: 1 }, [{ op: 'copy', path: '/c' }])
  })
})

await test('test', async (t) => {
  await t.test('passes on equal values', () => {
    const doc = { a: 1, b: [1, { c: null }], d: 'x', e: true }
    assert.deepEqual(
      applyJsonPatch(doc, [
        { op: 'test', path: '/a', value: 1 },
        { op: 'test', path: '/b', value: [1, { c: null }] },
        { op: 'test', path: '/d', value: 'x' },
        { op: 'test', path: '', value: { e: true, d: 'x', b: [1, { c: null }], a: 1 } },
      ]),
      doc,
    )
  })
  await t.test('fails on different values', () => {
    fails({ a: 1 }, [{ op: 'test', path: '/a', value: 2 }])
    fails({ a: 1 }, [{ op: 'test', path: '/a', value: '1' }])
    fails({ a: [1, 2] }, [{ op: 'test', path: '/a', value: [2, 1] }])
    fails({ a: { b: 1 } }, [{ op: 'test', path: '/a', value: { b: 1, c: 2 } }])
    fails({ a: [] }, [{ op: 'test', path: '/a', value: {} }])
    fails({ a: null }, [{ op: 'test', path: '/a', value: {} }])
  })
  await t.test('fails on missing path', () => {
    fails({ a: 1 }, [{ op: 'test', path: '/b', value: 1 }])
  })
  await t.test('a failed test leaves the input unchanged', () => {
    const doc = { a: 1, list: [1, 2], nested: { b: 2 } }
    const snapshot = structuredClone(doc)
    assert.throws(
      () =>
        applyJsonPatch(doc, [
          { op: 'replace', path: '/a', value: 99 },
          { op: 'add', path: '/list/-', value: 3 },
          { op: 'remove', path: '/nested/b' },
          { op: 'test', path: '/a', value: 1 },
        ]),
      JsonPatchError,
    )
    assert.deepEqual(doc, snapshot)
  })
})

await test('JSON Pointer escaping', async (t) => {
  await t.test('~1 is "/" and ~0 is "~"', () => {
    const doc = { 'a/b': 1, 'm~n': 2, '~1': 3, '': 4 }
    assert.deepEqual(
      applyJsonPatch(doc, [
        { op: 'test', path: '/a~1b', value: 1 },
        { op: 'test', path: '/m~0n', value: 2 },
        { op: 'test', path: '/~01', value: 3 },
        { op: 'test', path: '/', value: 4 },
        { op: 'replace', path: '/a~1b', value: 10 },
        { op: 'add', path: '/c~1d~0e', value: 5 },
      ]),
      { 'a/b': 10, 'm~n': 2, '~1': 3, '': 4, 'c/d~e': 5 },
    )
  })
  await t.test('escapes in from', () => {
    assert.deepEqual(applyJsonPatch({ 'a/b': 1 }, [{ op: 'move', from: '/a~1b', path: '/m~0n' }]), {
      'm~n': 1,
    })
  })
  await t.test('invalid escape is rejected', () => {
    fails({ a: 1 }, [{ op: 'test', path: '/a~2', value: 1 }])
  })
})

await test('does not mutate inputs', () => {
  const doc = { a: { b: [1, 2] }, c: 1 }
  const patch = [
    { op: 'add', path: '/a/b/-', value: { x: 1 } },
    { op: 'copy', from: '/a', path: '/d' },
    { op: 'move', from: '/c', path: '/e' },
    { op: 'replace', path: '/a/b/0', value: 'z' },
    { op: 'add', path: '/d/b/-', value: 'only in d' },
  ]
  const docSnapshot = structuredClone(doc)
  const patchSnapshot = structuredClone(patch)
  const result = applyJsonPatch(doc, patch)
  assert.deepEqual(doc, docSnapshot)
  assert.deepEqual(patch, patchSnapshot)
  assert.notEqual(result, doc)
  assert.deepEqual(result, {
    a: { b: ['z', 2, { x: 1 }] },
    d: { b: [1, 2, { x: 1 }, 'only in d'] },
    e: 1,
  })
  // Mutating the result must not affect the patch document
  ;((result as { a: { b: Json[] } }).a.b[2] as { x: number }).x = 42
  assert.deepEqual(patch, patchSnapshot)
})

await test('applies operations in order', () => {
  assert.deepEqual(
    applyJsonPatch({ a: 1 }, [
      { op: 'add', path: '/b', value: 2 },
      { op: 'move', from: '/a', path: '/c' },
      { op: 'test', path: '/c', value: 1 },
    ]),
    { b: 2, c: 1 },
  )
  assert.deepEqual(applyJsonPatch({ a: 1 }, []), { a: 1 })
})

await test('rejects invalid documents', () => {
  fails({}, null)
  fails({}, {})
  fails({}, 'x')
  fails({}, [null])
  fails({}, [[]])
  fails({}, [{}])
  fails({}, [{ op: 'nope', path: '/a' }])
  fails({}, [{ op: 'add', value: 1 }])
  fails({}, [{ op: 'add', path: 1, value: 1 }])
  fails({}, [{ op: 'add', path: 'a', value: 1 }])
  fails({}, [{ op: 'move', from: 1, path: '/a' }])
  // an invalid operation after a valid one rejects the whole document
  fails({}, [
    { op: 'add', path: '/a', value: 1 },
    { op: 'bogus', path: '/b' },
  ])
})

await test('handles __proto__ keys as plain data', () => {
  const result = applyJsonPatch({}, [{ op: 'add', path: '/__proto__', value: { polluted: true } }])
  assert.equal(Object.getPrototypeOf(result), Object.prototype)
  assert.equal(({} as Record<string, unknown>)['polluted'], undefined)
  assert.deepEqual(Object.keys(result as object), ['__proto__'])
})
