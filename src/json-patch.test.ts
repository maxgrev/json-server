import assert from 'node:assert/strict'
import test from 'node:test'

import { applyJsonPatch, JsonPatchError } from './json-patch.ts'
import type { Json } from './json-patch.ts'

function apply(doc: Json, patch: unknown): Json {
  return applyJsonPatch(doc, patch)
}

function fails(doc: Json, patch: unknown): void {
  const before = structuredClone(doc)
  assert.throws(() => apply(doc, patch), JsonPatchError)
  assert.deepEqual(doc, before)
}

await test('add', async (t) => {
  await t.test('object member', () => {
    assert.deepEqual(apply({ a: 1 }, [{ op: 'add', path: '/b', value: 2 }]), { a: 1, b: 2 })
  })
  await t.test('replaces existing member', () => {
    assert.deepEqual(apply({ a: 1 }, [{ op: 'add', path: '/a', value: 2 }]), { a: 2 })
  })
  await t.test('nested member', () => {
    assert.deepEqual(apply({ a: { b: 1 } }, [{ op: 'add', path: '/a/c', value: [1] }]), {
      a: { b: 1, c: [1] },
    })
  })
  await t.test('array insert shifts items', () => {
    assert.deepEqual(apply([1, 3], [{ op: 'add', path: '/1', value: 2 }]), [1, 2, 3])
  })
  await t.test('array index equal to length appends', () => {
    assert.deepEqual(apply([1], [{ op: 'add', path: '/1', value: 2 }]), [1, 2])
  })
  await t.test('- appends to array', () => {
    assert.deepEqual(apply({ a: [1] }, [{ op: 'add', path: '/a/-', value: 2 }]), { a: [1, 2] })
  })
  await t.test('empty path replaces document', () => {
    assert.deepEqual(apply({ a: 1 }, [{ op: 'add', path: '', value: [1] }]), [1])
  })
  await t.test('fails on missing parent', () => {
    fails({ a: 1 }, [{ op: 'add', path: '/x/y', value: 1 }])
  })
  await t.test('fails on out of bounds index', () => {
    fails([1], [{ op: 'add', path: '/3', value: 1 }])
  })
  await t.test('fails on invalid index', () => {
    fails([1], [{ op: 'add', path: '/01', value: 1 }])
    fails([1], [{ op: 'add', path: '/-1', value: 1 }])
    fails([1], [{ op: 'add', path: '/a', value: 1 }])
  })
  await t.test('fails on missing value', () => {
    fails({}, [{ op: 'add', path: '/a' }])
  })
  await t.test('fails when parent is a scalar', () => {
    fails({ a: 1 }, [{ op: 'add', path: '/a/b', value: 1 }])
  })
})

await test('remove', async (t) => {
  await t.test('object member', () => {
    assert.deepEqual(apply({ a: 1, b: 2 }, [{ op: 'remove', path: '/a' }]), { b: 2 })
  })
  await t.test('array item shifts items', () => {
    assert.deepEqual(apply([1, 2, 3], [{ op: 'remove', path: '/1' }]), [1, 3])
  })
  await t.test('fails on missing member', () => {
    fails({ a: 1 }, [{ op: 'remove', path: '/b' }])
  })
  await t.test('fails on out of bounds index and -', () => {
    fails([1], [{ op: 'remove', path: '/1' }])
    fails([1], [{ op: 'remove', path: '/-' }])
  })
  await t.test('fails on root', () => {
    fails({ a: 1 }, [{ op: 'remove', path: '' }])
  })
})

await test('replace', async (t) => {
  await t.test('object member', () => {
    assert.deepEqual(apply({ a: 1 }, [{ op: 'replace', path: '/a', value: { b: 2 } }]), {
      a: { b: 2 },
    })
  })
  await t.test('array item', () => {
    assert.deepEqual(apply([1, 2], [{ op: 'replace', path: '/0', value: 9 }]), [9, 2])
  })
  await t.test('root', () => {
    assert.deepEqual(apply({ a: 1 }, [{ op: 'replace', path: '', value: 'x' }]), 'x')
  })
  await t.test('fails on missing member', () => {
    fails({ a: 1 }, [{ op: 'replace', path: '/b', value: 1 }])
  })
  await t.test('fails on index equal to length', () => {
    fails([1], [{ op: 'replace', path: '/1', value: 1 }])
  })
})

await test('move', async (t) => {
  await t.test('object member', () => {
    assert.deepEqual(apply({ a: 1, b: {} }, [{ op: 'move', from: '/a', path: '/b/c' }]), {
      b: { c: 1 },
    })
  })
  await t.test('array item', () => {
    assert.deepEqual(apply([1, 2, 3], [{ op: 'move', from: '/0', path: '/2' }]), [2, 3, 1])
  })
  await t.test('to end of array with -', () => {
    assert.deepEqual(apply([1, 2, 3], [{ op: 'move', from: '/0', path: '/-' }]), [2, 3, 1])
  })
  await t.test('same location is a no-op', () => {
    assert.deepEqual(apply({ a: 1 }, [{ op: 'move', from: '/a', path: '/a' }]), { a: 1 })
  })
  await t.test('fails on missing from', () => {
    fails({ a: 1 }, [{ op: 'move', from: '/b', path: '/c' }])
  })
  await t.test('fails when moving into own child', () => {
    fails({ a: { b: 1 } }, [{ op: 'move', from: '/a', path: '/a/c' }])
  })
  await t.test('fails without from', () => {
    fails({ a: 1 }, [{ op: 'move', path: '/c' }])
  })
})

await test('copy', async (t) => {
  await t.test('copies a value', () => {
    assert.deepEqual(apply({ a: 1 }, [{ op: 'copy', from: '/a', path: '/b' }]), { a: 1, b: 1 })
  })
  await t.test('copy is deep', () => {
    const result = apply({ a: { x: 1 } }, [
      { op: 'copy', from: '/a', path: '/b' },
      { op: 'replace', path: '/b/x', value: 2 },
    ])
    assert.deepEqual(result, { a: { x: 1 }, b: { x: 2 } })
  })
  await t.test('fails on missing from', () => {
    fails({ a: 1 }, [{ op: 'copy', from: '/b', path: '/c' }])
  })
})

await test('test', async (t) => {
  await t.test('passes on equal scalar', () => {
    assert.deepEqual(apply({ a: 1 }, [{ op: 'test', path: '/a', value: 1 }]), { a: 1 })
  })
  await t.test('passes on equal object regardless of key order', () => {
    const doc = { a: { x: 1, y: [1, { z: null }] } }
    apply(doc, [{ op: 'test', path: '/a', value: { y: [1, { z: null }], x: 1 } }])
  })
  await t.test('passes on root', () => {
    apply({ a: 1 }, [{ op: 'test', path: '', value: { a: 1 } }])
  })
  await t.test('fails on different value', () => {
    fails({ a: 1 }, [{ op: 'test', path: '/a', value: 2 }])
  })
  await t.test('does not coerce types', () => {
    fails({ a: 1 }, [{ op: 'test', path: '/a', value: '1' }])
    fails({ a: [] }, [{ op: 'test', path: '/a', value: {} }])
    fails({ a: null }, [{ op: 'test', path: '/a', value: 0 }])
  })
  await t.test('fails on array length difference', () => {
    fails({ a: [1, 2] }, [{ op: 'test', path: '/a', value: [1] }])
  })
  await t.test('fails on missing path', () => {
    fails({ a: 1 }, [{ op: 'test', path: '/b', value: 1 }])
  })
})

await test('JSON Pointer', async (t) => {
  await t.test('~1 is /', () => {
    assert.deepEqual(apply({ 'a/b': 1 }, [{ op: 'replace', path: '/a~1b', value: 2 }]), {
      'a/b': 2,
    })
  })
  await t.test('~0 is ~', () => {
    assert.deepEqual(apply({ 'a~b': 1 }, [{ op: 'replace', path: '/a~0b', value: 2 }]), {
      'a~b': 2,
    })
  })
  await t.test('~01 is ~1, not /', () => {
    assert.deepEqual(apply({ '~1': 1, '/': 2 }, [{ op: 'replace', path: '/~01', value: 3 }]), {
      '~1': 3,
      '/': 2,
    })
  })
  await t.test('escapes in from', () => {
    assert.deepEqual(apply({ 'a/b': 1 }, [{ op: 'move', from: '/a~1b', path: '/c~0d' }]), {
      'c~d': 1,
    })
  })
  await t.test('empty key', () => {
    assert.deepEqual(apply({ '': 1 }, [{ op: 'replace', path: '/', value: 2 }]), { '': 2 })
  })
  await t.test('rejects bad escapes', () => {
    fails({}, [{ op: 'add', path: '/a~2', value: 1 }])
    fails({}, [{ op: 'add', path: '/a~', value: 1 }])
  })
  await t.test('rejects pointer not starting with /', () => {
    fails({ a: 1 }, [{ op: 'replace', path: 'a', value: 1 }])
  })
  await t.test('- only valid for add-like targets', () => {
    fails([1], [{ op: 'replace', path: '/-', value: 1 }])
    fails([1], [{ op: 'test', path: '/-', value: 1 }])
  })
  await t.test('__proto__ is a plain key', () => {
    const result = apply({}, [{ op: 'add', path: '/__proto__', value: { x: 1 } }]) as object
    assert.ok(Object.hasOwn(result, '__proto__'))
    assert.equal(Object.getPrototypeOf(result), Object.prototype)
    assert.equal(({} as Record<string, unknown>)['x'], undefined)
  })
})

await test('applyJsonPatch', async (t) => {
  await t.test('empty patch returns an equal copy', () => {
    const doc = { a: [1, 2] }
    const result = apply(doc, [])
    assert.deepEqual(result, doc)
    assert.notEqual(result, doc)
  })
  await t.test('operations apply in order', () => {
    assert.deepEqual(
      apply({ a: 1 }, [
        { op: 'add', path: '/b', value: 2 },
        { op: 'test', path: '/b', value: 2 },
        { op: 'move', from: '/b', path: '/c' },
        { op: 'remove', path: '/a' },
      ]),
      { c: 2 },
    )
  })
  await t.test('does not mutate the input on success', () => {
    const doc = { a: { b: [1, 2] }, c: 1 }
    const before = structuredClone(doc)
    apply(doc, [
      { op: 'add', path: '/a/b/-', value: 3 },
      { op: 'remove', path: '/c' },
      { op: 'replace', path: '/a/b/0', value: 0 },
    ])
    assert.deepEqual(doc, before)
  })
  await t.test('does not alias values from the patch document', () => {
    const value = { x: 1 }
    const result = apply({}, [{ op: 'add', path: '/a', value }]) as { a: { x: number } }
    result.a.x = 2
    assert.deepEqual(value, { x: 1 })
  })
  await t.test('failed test operation leaves the input unchanged', () => {
    const doc = { a: 1, list: [1, 2] }
    const before = structuredClone(doc)
    assert.throws(
      () =>
        apply(doc, [
          { op: 'replace', path: '/a', value: 2 },
          { op: 'add', path: '/list/-', value: 3 },
          { op: 'test', path: '/a', value: 99 },
        ]),
      (error: unknown) => {
        assert.ok(error instanceof JsonPatchError)
        assert.equal(error.operationIndex, 2)
        assert.match(error.message, /test failed/)
        return true
      },
    )
    assert.deepEqual(doc, before)
  })
  await t.test('failed operation after successful ones leaves the input unchanged', () => {
    fails({ a: 1 }, [
      { op: 'add', path: '/b', value: 2 },
      { op: 'remove', path: '/missing' },
    ])
  })
  await t.test('rejects non-array documents', () => {
    for (const patch of [{}, null, 'x', 1, undefined, { op: 'add', path: '/a', value: 1 }]) {
      fails({ a: 1 }, patch)
    }
  })
  await t.test('rejects invalid operations', () => {
    fails({}, [null])
    fails({}, ['add'])
    fails({}, [[]])
    fails({}, [{ path: '/a', value: 1 }])
    fails({}, [{ op: 'nope', path: '/a', value: 1 }])
    fails({}, [{ op: 'add', value: 1 }])
    fails({}, [{ op: 'add', path: 1, value: 1 }])
    fails({}, [{ op: 'copy', path: '/a' }])
    fails({}, [{ op: 'test', path: '' }])
  })
  await t.test('error is a JsonPatchError with a name', () => {
    try {
      apply({}, 'x')
      assert.fail('should throw')
    } catch (error) {
      assert.ok(error instanceof JsonPatchError)
      assert.ok(error instanceof Error)
      assert.equal(error.name, 'JsonPatchError')
      assert.equal(error.operationIndex, undefined)
    }
  })
})
