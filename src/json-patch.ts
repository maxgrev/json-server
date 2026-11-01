// RFC 6902 JSON Patch applied to RFC 6901 JSON Pointers.
// Pure: the input document is never mutated, a new value is returned.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

type JsonObject = { [key: string]: Json }

export type JsonPatchOperation =
  | { op: 'add' | 'replace' | 'test'; path: string; value: Json }
  | { op: 'remove'; path: string }
  | { op: 'move' | 'copy'; path: string; from: string }

export class JsonPatchError extends Error {
  // Index of the failing operation in the patch document, if any
  operationIndex?: number

  constructor(message: string, operationIndex?: number) {
    super(operationIndex === undefined ? message : `operation ${operationIndex}: ${message}`)
    this.name = 'JsonPatchError'
    this.operationIndex = operationIndex
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clone<T extends Json>(value: T): T {
  return structuredClone(value)
}

function parsePointer(pointer: unknown): string[] {
  if (typeof pointer !== 'string') {
    throw new JsonPatchError('JSON Pointer must be a string')
  }
  if (pointer === '') {
    return []
  }
  if (!pointer.startsWith('/')) {
    throw new JsonPatchError(`invalid JSON Pointer "${pointer}"`)
  }
  return pointer
    .slice(1)
    .split('/')
    .map((token) => {
      if (/~(?![01])/.test(token)) {
        throw new JsonPatchError(`invalid escape sequence in JSON Pointer "${pointer}"`)
      }
      return token.replace(/~1/g, '/').replace(/~0/g, '~')
    })
}

function parseIndex(token: string, length: number, allowEnd: boolean): number {
  if (allowEnd && token === '-') {
    return length
  }
  if (!/^(0|[1-9][0-9]*)$/.test(token)) {
    throw new JsonPatchError(`invalid array index "${token}"`)
  }
  const index = Number(token)
  if (index > length || (index === length && !allowEnd)) {
    throw new JsonPatchError(`array index ${token} is out of bounds`)
  }
  return index
}

function setProperty(obj: JsonObject, key: string, value: Json): void {
  // defineProperty so that a "__proto__" key is a plain own property
  Object.defineProperty(obj, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  })
}

// Resolves the container holding the last token of a non-root pointer
function resolveParent(doc: Json, tokens: string[]): Json {
  let current = doc
  for (const token of tokens.slice(0, -1)) {
    if (Array.isArray(current)) {
      current = current[parseIndex(token, current.length, false)]!
    } else if (isObject(current) && Object.hasOwn(current, token)) {
      current = current[token]!
    } else {
      throw new JsonPatchError(`path not found: "${token}"`)
    }
  }
  return current
}

function getValue(doc: Json, pointer: unknown): Json {
  const tokens = parsePointer(pointer)
  if (tokens.length === 0) {
    return doc
  }
  const parent = resolveParent(doc, tokens)
  const last = tokens[tokens.length - 1]!
  if (Array.isArray(parent)) {
    return parent[parseIndex(last, parent.length, false)]!
  }
  if (isObject(parent) && Object.hasOwn(parent, last)) {
    return parent[last]!
  }
  throw new JsonPatchError(`path not found: "${pointer}"`)
}

// The following helpers mutate the working copy and return the (possibly new) root

function addValue(doc: Json, pointer: unknown, value: Json): Json {
  const tokens = parsePointer(pointer)
  if (tokens.length === 0) {
    return value
  }
  const parent = resolveParent(doc, tokens)
  const last = tokens[tokens.length - 1]!
  if (Array.isArray(parent)) {
    parent.splice(parseIndex(last, parent.length, true), 0, value)
  } else if (isObject(parent)) {
    setProperty(parent, last, value)
  } else {
    throw new JsonPatchError(`path not found: "${pointer}"`)
  }
  return doc
}

function removeValue(doc: Json, pointer: unknown): Json {
  const tokens = parsePointer(pointer)
  if (tokens.length === 0) {
    throw new JsonPatchError('cannot remove the document root')
  }
  const parent = resolveParent(doc, tokens)
  const last = tokens[tokens.length - 1]!
  if (Array.isArray(parent)) {
    parent.splice(parseIndex(last, parent.length, false), 1)
  } else if (isObject(parent) && Object.hasOwn(parent, last)) {
    delete parent[last]
  } else {
    throw new JsonPatchError(`path not found: "${pointer}"`)
  }
  return doc
}

function replaceValue(doc: Json, pointer: unknown, value: Json): Json {
  const tokens = parsePointer(pointer)
  if (tokens.length === 0) {
    return value
  }
  const parent = resolveParent(doc, tokens)
  const last = tokens[tokens.length - 1]!
  if (Array.isArray(parent)) {
    parent[parseIndex(last, parent.length, false)] = value
  } else if (isObject(parent) && Object.hasOwn(parent, last)) {
    setProperty(parent, last, value)
  } else {
    throw new JsonPatchError(`path not found: "${pointer}"`)
  }
  return doc
}

function deepEqual(a: Json, b: Json): boolean {
  if (a === b) {
    return true
  }
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((item, i) => deepEqual(item, b[i]!))
  }
  if (isObject(a)) {
    if (!isObject(b)) {
      return false
    }
    const keys = Object.keys(a)
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && deepEqual(a[key]!, b[key]!))
    )
  }
  return false
}

function requireString(operation: Record<string, unknown>, member: string): string {
  const value = operation[member]
  if (typeof value !== 'string') {
    throw new JsonPatchError(`"${member}" must be a string`)
  }
  return value
}

function requireValue(operation: Record<string, unknown>): Json {
  if (!Object.hasOwn(operation, 'value') || operation['value'] === undefined) {
    throw new JsonPatchError('"value" is required')
  }
  return operation['value'] as Json
}

function applyOperation(doc: Json, operation: unknown): Json {
  if (typeof operation !== 'object' || operation === null || Array.isArray(operation)) {
    throw new JsonPatchError('operation must be an object')
  }
  const op = operation as Record<string, unknown>
  const name = op['op']
  const path = requireString(op, 'path')

  switch (name) {
    case 'add':
      return addValue(doc, path, clone(requireValue(op)))
    case 'remove':
      return removeValue(doc, path)
    case 'replace':
      return replaceValue(doc, path, clone(requireValue(op)))
    case 'move': {
      const from = requireString(op, 'from')
      const value = getValue(doc, from)
      if (from === path) {
        return doc
      }
      if (path.startsWith(`${from}/`)) {
        throw new JsonPatchError('cannot move a value into one of its children')
      }
      return addValue(removeValue(doc, from), path, value)
    }
    case 'copy': {
      const from = requireString(op, 'from')
      return addValue(doc, path, clone(getValue(doc, from)))
    }
    case 'test': {
      const value = requireValue(op)
      if (!deepEqual(getValue(doc, path), value)) {
        throw new JsonPatchError(`test failed at "${path}"`)
      }
      return doc
    }
    default:
      throw new JsonPatchError(`unknown operation ${JSON.stringify(name)}`)
  }
}

/**
 * Applies a JSON Patch document to a value and returns the result.
 * The input is never mutated. If the document is invalid or any operation
 * fails (including `test`), a JsonPatchError is thrown and nothing is applied.
 */
export function applyJsonPatch(document: Json, patch: unknown): Json {
  if (!Array.isArray(patch)) {
    throw new JsonPatchError('JSON Patch document must be an array of operations')
  }
  let result = clone(document)
  for (const [index, operation] of patch.entries()) {
    try {
      result = applyOperation(result, operation)
    } catch (error) {
      if (error instanceof JsonPatchError && error.operationIndex === undefined) {
        throw new JsonPatchError(error.message, index)
      }
      throw error
    }
  }
  return result
}
