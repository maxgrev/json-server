import assert from 'node:assert/strict'
import test from 'node:test'

import { applyJsonPatch, JsonPatchError } from './json-patch.ts'

function ok(doc: unknown, ops: unknown, expected: unknown) {
  const before = structuredClone(doc)
  assert.deepEqual(applyJsonPatch(doc, ops), expected)
  assert.deepEqual(doc, before, 'input document must not be mutated')
}

function fails(doc: unknown, ops: unknown, kind: 'invalid' | 'conflict') {
  const before = structuredClone(doc)
  assert.throws(
    () => applyJsonPatch(doc, ops),
    (e: unknown) => e instanceof JsonPatchError && e.kind === kind,
  )
  assert.deepEqual(doc, before, 'input document must not be mutated')
}

await test('RFC 6902 Appendix A', async (t) => {
  await t.test('A.1 adding an object member', () => {
    ok({ foo: 'bar' }, [{ op: 'add', path: '/baz', value: 'qux' }], { baz: 'qux', foo: 'bar' })
  })

  await t.test('A.2 adding an array element', () => {
    ok({ foo: ['bar', 'baz'] }, [{ op: 'add', path: '/foo/1', value: 'qux' }], {
      foo: ['bar', 'qux', 'baz'],
    })
  })

  await t.test('A.3 removing an object member', () => {
    ok({ baz: 'qux', foo: 'bar' }, [{ op: 'remove', path: '/baz' }], { foo: 'bar' })
  })

  await t.test('A.4 removing an array element', () => {
    ok({ foo: ['bar', 'qux', 'baz'] }, [{ op: 'remove', path: '/foo/1' }], { foo: ['bar', 'baz'] })
  })

  await t.test('A.5 replacing a value', () => {
    ok({ baz: 'qux', foo: 'bar' }, [{ op: 'replace', path: '/baz', value: 'boo' }], {
      baz: 'boo',
      foo: 'bar',
    })
  })

  await t.test('A.6 moving a value', () => {
    ok(
      { foo: { bar: 'baz', waldo: 'fred' }, qux: { corge: 'grault' } },
      [{ op: 'move', from: '/foo/waldo', path: '/qux/thud' }],
      { foo: { bar: 'baz' }, qux: { corge: 'grault', thud: 'fred' } },
    )
  })

  await t.test('A.7 moving an array element', () => {
    ok({ foo: ['all', 'grass', 'cows', 'eat'] }, [{ op: 'move', from: '/foo/1', path: '/foo/3' }], {
      foo: ['all', 'cows', 'eat', 'grass'],
    })
  })

  await t.test('A.8 testing a value: success', () => {
    ok(
      { baz: 'qux', foo: ['a', 2, 'c'] },
      [
        { op: 'test', path: '/baz', value: 'qux' },
        { op: 'test', path: '/foo/1', value: 2 },
      ],
      { baz: 'qux', foo: ['a', 2, 'c'] },
    )
  })

  await t.test('A.9 testing a value: error', () => {
    fails({ baz: 'qux' }, [{ op: 'test', path: '/baz', value: 'bar' }], 'conflict')
  })

  await t.test('A.10 adding a nested member object', () => {
    ok({ foo: 'bar' }, [{ op: 'add', path: '/child', value: { grandchild: {} } }], {
      foo: 'bar',
      child: { grandchild: {} },
    })
  })

  await t.test('A.11 ignoring unrecognized elements', () => {
    ok({ foo: 'bar' }, [{ op: 'add', path: '/baz', value: 'qux', xyz: 123 }], {
      foo: 'bar',
      baz: 'qux',
    })
  })

  await t.test('A.12 adding to a nonexistent target', () => {
    fails({ foo: 'bar' }, [{ op: 'add', path: '/baz/bat', value: 'qux' }], 'conflict')
  })

  await t.test('A.13 invalid JSON patch document', () => {
    // Duplicate "op" members: JSON.parse keeps the last one ("remove"), and
    // removing a nonexistent /baz must fail.
    const ops = JSON.parse('[{"op":"add","path":"/baz","value":"qux","op":"remove"}]')
    assert.throws(() => applyJsonPatch({ foo: 'bar' }, ops), JsonPatchError)
    // A patch that is not an array is invalid.
    fails({ foo: 'bar' }, { op: 'add', path: '/baz', value: 'qux' }, 'invalid')
  })

  await t.test('A.14 ~ escape ordering', () => {
    ok({ '/': 9, '~1': 10 }, [{ op: 'test', path: '/~01', value: 10 }], { '/': 9, '~1': 10 })
  })

  await t.test('A.15 comparing strings and numbers', () => {
    fails({ '/': 9, '~1': 10 }, [{ op: 'test', path: '/~01', value: '10' }], 'conflict')
  })

  await t.test('A.16 adding an array value', () => {
    ok({ foo: ['bar'] }, [{ op: 'add', path: '/foo/-', value: ['abc', 'def'] }], {
      foo: ['bar', ['abc', 'def']],
    })
  })
})

await test('JSON Pointer', async (t) => {
  await t.test('~0 and ~1 escaped keys', () => {
    ok(
      { 'a/b': 1, 'm~n': 2 },
      [
        { op: 'replace', path: '/a~1b', value: 10 },
        { op: 'replace', path: '/m~0n', value: 20 },
        { op: 'add', path: '/x~1y~0z', value: 3 },
      ],
      { 'a/b': 10, 'm~n': 20, 'x/y~z': 3 },
    )
  })

  await t.test('~ not followed by 0 or 1 is invalid', () => {
    fails({ a: 1 }, [{ op: 'remove', path: '/a~2' }], 'invalid')
    fails({ a: 1 }, [{ op: 'remove', path: '/a~' }], 'invalid')
  })

  await t.test('pointer must be empty or start with "/"', () => {
    fails({ a: 1 }, [{ op: 'remove', path: 'a' }], 'invalid')
  })

  await t.test('empty key is addressable with "/"', () => {
    ok({ '': 1 }, [{ op: 'replace', path: '/', value: 2 }], { '': 2 })
  })
})

await test('arrays', async (t) => {
  await t.test("'-' appends", () => {
    ok({ a: [1] }, [{ op: 'add', path: '/a/-', value: 2 }], { a: [1, 2] })
    ok([], [{ op: 'add', path: '/-', value: 1 }], [1])
  })

  await t.test('add at index == length appends, > length fails', () => {
    ok({ a: [1] }, [{ op: 'add', path: '/a/1', value: 2 }], { a: [1, 2] })
    fails({ a: [1] }, [{ op: 'add', path: '/a/2', value: 2 }], 'conflict')
  })

  await t.test('bad indexes fail', () => {
    for (const idx of ['-1', '01', '1.5', 'x', '']) {
      fails({ a: [1] }, [{ op: 'add', path: `/a/${idx}`, value: 2 }], 'conflict')
    }
    fails({ a: [1] }, [{ op: 'remove', path: '/a/1' }], 'conflict')
    fails({ a: [1] }, [{ op: 'remove', path: '/a/-' }], 'conflict')
    fails({ a: [1] }, [{ op: 'replace', path: '/a/1', value: 2 }], 'conflict')
    fails({ a: [1] }, [{ op: 'replace', path: '/a/-', value: 2 }], 'conflict')
    fails({ a: [1] }, [{ op: 'test', path: '/a/-', value: 1 }], 'conflict')
  })

  await t.test('nested array insert and remove', () => {
    ok(
      { a: [{ b: [1, 3] }, { b: [] }] },
      [
        { op: 'add', path: '/a/0/b/1', value: 2 },
        { op: 'add', path: '/a/1/b/-', value: 9 },
        { op: 'remove', path: '/a/0/b/0' },
      ],
      { a: [{ b: [2, 3] }, { b: [9] }] },
    )
  })

  await t.test('array root document', () => {
    ok([{ id: '1' }], [{ op: 'replace', path: '/0/id', value: '2' }], [{ id: '2' }])
  })
})

await test('operations', async (t) => {
  await t.test('replace requires an existing target', () => {
    fails({ a: 1 }, [{ op: 'replace', path: '/b', value: 1 }], 'conflict')
  })

  await t.test('remove requires an existing target', () => {
    fails({ a: 1 }, [{ op: 'remove', path: '/b' }], 'conflict')
    fails({ a: 1 }, [{ op: 'remove', path: '/b/c' }], 'conflict')
  })

  await t.test('add overwrites an existing member', () => {
    ok({ a: 1 }, [{ op: 'add', path: '/a', value: 2 }], { a: 2 })
  })

  await t.test('null values are allowed', () => {
    ok({ a: 1 }, [{ op: 'add', path: '/a', value: null }], { a: null })
    ok({ a: null }, [{ op: 'test', path: '/a', value: null }], { a: null })
  })

  await t.test('add/replace at root replaces the document', () => {
    ok({ a: 1 }, [{ op: 'add', path: '', value: { b: 2 } }], { b: 2 })
    ok({ a: 1 }, [{ op: 'replace', path: '', value: [1] }], [1])
  })

  await t.test('remove at root is a conflict', () => {
    fails({ a: 1 }, [{ op: 'remove', path: '' }], 'conflict')
  })

  await t.test('copy duplicates a value without aliasing', () => {
    const result = applyJsonPatch({ a: { x: 1 } }, [
      { op: 'copy', from: '/a', path: '/b' },
      { op: 'add', path: '/a/y', value: 2 },
    ]) as { a: object; b: object }
    assert.deepEqual(result, { a: { x: 1, y: 2 }, b: { x: 1 } })
  })

  await t.test('copy from a missing path fails', () => {
    fails({ a: 1 }, [{ op: 'copy', from: '/z', path: '/b' }], 'conflict')
  })

  await t.test('move to the same location is a no-op', () => {
    ok({ a: 1 }, [{ op: 'move', from: '/a', path: '/a' }], { a: 1 })
    fails({ a: 1 }, [{ op: 'move', from: '/z', path: '/z' }], 'conflict')
  })

  await t.test('move into its own child is rejected', () => {
    fails({ a: { b: {} } }, [{ op: 'move', from: '/a', path: '/a/b/c' }], 'conflict')
    fails({ a: {} }, [{ op: 'move', from: '', path: '/a' }], 'conflict')
  })

  await t.test('move from a missing path fails', () => {
    fails({ a: 1 }, [{ op: 'move', from: '/z', path: '/b' }], 'conflict')
  })

  await t.test('test compares deeply, ignoring key order', () => {
    ok(
      { a: { x: 1, y: [1, { z: 2 }] } },
      [{ op: 'test', path: '/a', value: { y: [1, { z: 2 }], x: 1 } }],
      { a: { x: 1, y: [1, { z: 2 }] } },
    )
    fails({ a: { x: 1 } }, [{ op: 'test', path: '/a', value: { x: 1, y: 2 } }], 'conflict')
    fails({ a: [1, 2] }, [{ op: 'test', path: '/a', value: [1] }], 'conflict')
    fails({ a: [] }, [{ op: 'test', path: '/a', value: {} }], 'conflict')
    fails({ a: null }, [{ op: 'test', path: '/a', value: {} }], 'conflict')
  })

  await t.test('empty patch returns an equal copy', () => {
    const doc = { a: 1 }
    const result = applyJsonPatch(doc, [])
    assert.deepEqual(result, doc)
    assert.notEqual(result, doc)
  })

  await t.test('patch values are not aliased into the result', () => {
    const value = { x: 1 }
    const ops = [{ op: 'add', path: '/a', value }]
    const result = applyJsonPatch({}, ops) as { a: { x: number } }
    result.a.x = 2
    assert.deepEqual(value, { x: 1 })
  })
})

await test('invalid patch documents', async (t) => {
  await t.test('patch must be an array', () => {
    for (const bad of [{}, 'x', 1, null, undefined]) {
      fails({ a: 1 }, bad, 'invalid')
    }
  })

  await t.test('operations must be objects', () => {
    for (const bad of [null, 1, 'x', []]) {
      fails({ a: 1 }, [bad], 'invalid')
    }
  })

  await t.test('unknown or missing op', () => {
    fails({ a: 1 }, [{ op: 'nope', path: '/a' }], 'invalid')
    fails({ a: 1 }, [{ path: '/a' }], 'invalid')
    fails({ a: 1 }, [{ op: 1, path: '/a' }], 'invalid')
  })

  await t.test('missing or non-string path', () => {
    fails({ a: 1 }, [{ op: 'remove' }], 'invalid')
    fails({ a: 1 }, [{ op: 'remove', path: 1 }], 'invalid')
  })

  await t.test('missing value', () => {
    for (const op of ['add', 'replace', 'test']) {
      fails({ a: 1 }, [{ op, path: '/a' }], 'invalid')
    }
  })

  await t.test('missing or non-string from', () => {
    fails({ a: 1 }, [{ op: 'move', path: '/b' }], 'invalid')
    fails({ a: 1 }, [{ op: 'copy', path: '/b', from: 1 }], 'invalid')
    fails({ a: 1 }, [{ op: 'copy', path: '/b', from: 'a' }], 'invalid')
  })

  await t.test('validation happens before anything is applied', () => {
    fails(
      { a: 1 },
      [
        { op: 'add', path: '/b', value: 1 },
        { op: 'nope', path: '/a' },
      ],
      'invalid',
    )
  })
})

await test('atomicity', async (t) => {
  await t.test('valid op followed by a failing op leaves input intact', () => {
    const doc = { a: 1, list: [1, 2], nested: { x: 1 } }
    fails(
      doc,
      [
        { op: 'replace', path: '/a', value: 2 },
        { op: 'add', path: '/list/-', value: 3 },
        { op: 'remove', path: '/nested/x' },
        { op: 'test', path: '/a', value: 'nope' },
      ],
      'conflict',
    )
  })

  await t.test('successful application does not mutate input', () => {
    const doc = { a: 1, list: [1, 2], nested: { x: 1 } }
    const frozen = structuredClone(doc)
    const result = applyJsonPatch(doc, [
      { op: 'replace', path: '/a', value: 2 },
      { op: 'add', path: '/list/-', value: 3 },
      { op: 'move', from: '/nested/x', path: '/moved' },
    ])
    assert.deepEqual(doc, frozen)
    assert.deepEqual(result, { a: 2, list: [1, 2, 3], nested: {}, moved: 1 })
  })
})

await test('prototype safety', async (t) => {
  const clean = () => {
    assert.equal(({} as Record<string, unknown>)['polluted'], undefined)
    assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'), false)
  }

  await t.test('/__proto__ cannot be traversed', () => {
    fails({}, [{ op: 'add', path: '/__proto__/polluted', value: true }], 'conflict')
    fails({}, [{ op: 'replace', path: '/__proto__/polluted', value: true }], 'conflict')
    fails({}, [{ op: 'remove', path: '/__proto__/toString' }], 'conflict')
    clean()
  })

  await t.test('/constructor/prototype cannot be traversed', () => {
    fails({}, [{ op: 'add', path: '/constructor/prototype/polluted', value: true }], 'conflict')
    fails({}, [{ op: 'test', path: '/constructor', value: {} }], 'conflict')
    clean()
  })

  await t.test('prototype keys cannot be used as move/copy sources', () => {
    fails({}, [{ op: 'copy', from: '/__proto__', path: '/a' }], 'conflict')
    fails({}, [{ op: 'move', from: '/constructor', path: '/a' }], 'conflict')
    clean()
  })

  await t.test('arrays do not expose prototype members', () => {
    fails({ a: [] }, [{ op: 'add', path: '/a/__proto__/polluted', value: 1 }], 'conflict')
    fails({ a: [] }, [{ op: 'remove', path: '/a/length' }], 'conflict')
    clean()
  })

  await t.test('own "__proto__" and "constructor" keys are plain data', () => {
    const doc = JSON.parse('{"__proto__": {"x": 1}, "constructor": 2}')
    const result = applyJsonPatch(doc, [
      { op: 'replace', path: '/__proto__/x', value: 5 },
      { op: 'replace', path: '/constructor', value: 3 },
      { op: 'add', path: '/other', value: 1 },
    ]) as Record<string, unknown>
    assert.deepEqual(Object.getOwnPropertyDescriptor(result, '__proto__')?.value, { x: 5 })
    assert.equal(result['constructor'], 3)
    assert.equal(Object.getPrototypeOf(result), Object.prototype)
    clean()
  })

  await t.test('adding a "__proto__" key creates an own property only', () => {
    const result = applyJsonPatch({}, [
      { op: 'add', path: '/__proto__', value: { polluted: true } },
    ]) as object
    assert.equal(Object.getPrototypeOf(result), Object.prototype)
    assert.equal(Object.prototype.hasOwnProperty.call(result, '__proto__'), true)
    clean()
  })
})
