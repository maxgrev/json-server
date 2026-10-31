// RFC 6902 JSON Patch applied to JSON values using RFC 6901 JSON Pointers.
// Pure module: the input document is never mutated.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

export class JsonPatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JsonPatchError'
  }
}

type Operation =
  | { op: 'add' | 'replace' | 'test'; path: string; value: Json }
  | { op: 'remove'; path: string }
  | { op: 'move' | 'copy'; path: string; from: string }

const OPS = new Set(['add', 'remove', 'replace', 'move', 'copy', 'test'])

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

// Plain assignment would trigger the __proto__ setter, so define the property.
function setKey(obj: { [key: string]: Json }, key: string, value: Json): void {
  Object.defineProperty(obj, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  })
}

function clone(value: Json): Json {
  if (Array.isArray(value)) {
    return value.map(clone)
  }
  if (value !== null && typeof value === 'object') {
    const out: { [key: string]: Json } = {}
    for (const key of Object.keys(value)) {
      setKey(out, key, clone(value[key] as Json))
    }
    return out
  }
  return value
}

function isJson(value: unknown): value is Json {
  if (value === null) return true
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return true
    case 'number':
      return Number.isFinite(value)
    case 'object':
      return Array.isArray(value) ? value.every(isJson) : Object.values(value).every(isJson)
    default:
      return false
  }
}

function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true
  if (Array.isArray(a)) {
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => deepEqual(item, b[i] as Json))
    )
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(b)) return false
    const keysA = Object.keys(a)
    if (keysA.length !== Object.keys(b).length) return false
    return keysA.every((key) => hasOwn(b, key) && deepEqual(a[key] as Json, b[key] as Json))
  }
  return false
}

// RFC 6901: parse a JSON Pointer into unescaped reference tokens.
export function parsePointer(pointer: string): string[] {
  if (pointer === '') return []
  if (!pointer.startsWith('/')) {
    throw new JsonPatchError(`Invalid JSON Pointer "${pointer}": must be empty or start with "/"`)
  }
  return pointer
    .slice(1)
    .split('/')
    .map((token) => {
      if (/~(?![01])/.test(token)) {
        throw new JsonPatchError(`Invalid JSON Pointer "${pointer}": bad "~" escape`)
      }
      // ~1 must be decoded before ~0 so that "~01" becomes "~1"
      return token.replace(/~1/g, '/').replace(/~0/g, '~')
    })
}

function parseIndex(token: string, pointer: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(token)) {
    throw new JsonPatchError(`Invalid array index "${token}" in "${pointer}"`)
  }
  return Number(token)
}

type Container = Json[] | { [key: string]: Json }

// Walk to the container holding the last token of the pointer.
function getParent(doc: Json, tokens: string[], pointer: string): Container {
  let current = doc
  for (const token of tokens.slice(0, -1)) {
    if (Array.isArray(current)) {
      const index = parseIndex(token, pointer)
      if (index >= current.length) {
        throw new JsonPatchError(`Path not found: "${pointer}"`)
      }
      current = current[index] as Json
    } else if (current !== null && typeof current === 'object' && hasOwn(current, token)) {
      current = current[token] as Json
    } else {
      throw new JsonPatchError(`Path not found: "${pointer}"`)
    }
  }
  if (current === null || typeof current !== 'object') {
    throw new JsonPatchError(`Path not found: "${pointer}"`)
  }
  return current
}

function getValue(doc: Json, pointer: string): Json {
  const tokens = parsePointer(pointer)
  if (tokens.length === 0) return doc
  const parent = getParent(doc, tokens, pointer)
  const last = tokens[tokens.length - 1] as string
  if (Array.isArray(parent)) {
    const index = parseIndex(last, pointer)
    if (index >= parent.length) {
      throw new JsonPatchError(`Path not found: "${pointer}"`)
    }
    return parent[index] as Json
  }
  if (!hasOwn(parent, last)) {
    throw new JsonPatchError(`Path not found: "${pointer}"`)
  }
  return parent[last] as Json
}

// The following helpers mutate the (already cloned) working document and
// return the new root.
function addValue(doc: Json, pointer: string, value: Json): Json {
  const tokens = parsePointer(pointer)
  if (tokens.length === 0) return value
  const parent = getParent(doc, tokens, pointer)
  const last = tokens[tokens.length - 1] as string
  if (Array.isArray(parent)) {
    if (last === '-') {
      parent.push(value)
    } else {
      const index = parseIndex(last, pointer)
      if (index > parent.length) {
        throw new JsonPatchError(`Array index out of bounds: "${pointer}"`)
      }
      parent.splice(index, 0, value)
    }
  } else {
    setKey(parent, last, value)
  }
  return doc
}

function removeValue(doc: Json, pointer: string): Json {
  const tokens = parsePointer(pointer)
  if (tokens.length === 0) {
    throw new JsonPatchError('Cannot remove the document root')
  }
  const parent = getParent(doc, tokens, pointer)
  const last = tokens[tokens.length - 1] as string
  if (Array.isArray(parent)) {
    const index = parseIndex(last, pointer)
    if (index >= parent.length) {
      throw new JsonPatchError(`Path not found: "${pointer}"`)
    }
    parent.splice(index, 1)
  } else {
    if (!hasOwn(parent, last)) {
      throw new JsonPatchError(`Path not found: "${pointer}"`)
    }
    delete parent[last]
  }
  return doc
}

function replaceValue(doc: Json, pointer: string, value: Json): Json {
  const tokens = parsePointer(pointer)
  if (tokens.length === 0) return value
  const parent = getParent(doc, tokens, pointer)
  const last = tokens[tokens.length - 1] as string
  if (Array.isArray(parent)) {
    const index = parseIndex(last, pointer)
    if (index >= parent.length) {
      throw new JsonPatchError(`Path not found: "${pointer}"`)
    }
    parent[index] = value
  } else {
    if (!hasOwn(parent, last)) {
      throw new JsonPatchError(`Path not found: "${pointer}"`)
    }
    setKey(parent, last, value)
  }
  return doc
}

function parseOperation(raw: unknown, index: number): Operation {
  const where = `operation ${index}`
  if (!isObject(raw)) {
    throw new JsonPatchError(`Invalid ${where}: must be an object`)
  }
  const { op, path } = raw
  if (typeof op !== 'string' || !OPS.has(op)) {
    throw new JsonPatchError(`Invalid ${where}: unknown "op"`)
  }
  if (typeof path !== 'string') {
    throw new JsonPatchError(`Invalid ${where}: "path" must be a string`)
  }
  switch (op) {
    case 'add':
    case 'replace':
    case 'test': {
      if (!hasOwn(raw, 'value') || !isJson(raw['value'])) {
        throw new JsonPatchError(`Invalid ${where}: "value" is required and must be valid JSON`)
      }
      return { op, path, value: raw['value'] }
    }
    case 'remove':
      return { op, path }
    default: {
      // move, copy
      const from = raw['from']
      if (typeof from !== 'string') {
        throw new JsonPatchError(`Invalid ${where}: "from" must be a string`)
      }
      return { op: op as 'move' | 'copy', path, from }
    }
  }
}

function applyOperation(doc: Json, operation: Operation): Json {
  switch (operation.op) {
    case 'add':
      return addValue(doc, operation.path, clone(operation.value))
    case 'remove':
      return removeValue(doc, operation.path)
    case 'replace':
      return replaceValue(doc, operation.path, clone(operation.value))
    case 'copy':
      return addValue(doc, operation.path, clone(getValue(doc, operation.from)))
    case 'move': {
      const { from, path } = operation
      const value = getValue(doc, from)
      if (from === path) return doc
      if (path.startsWith(`${from}/`)) {
        throw new JsonPatchError(`Cannot move "${from}" into one of its own children`)
      }
      return addValue(removeValue(doc, from), path, value)
    }
    case 'test': {
      if (!deepEqual(getValue(doc, operation.path), operation.value)) {
        throw new JsonPatchError(`Test failed at "${operation.path}"`)
      }
      return doc
    }
  }
}

/**
 * Apply an RFC 6902 JSON Patch document to a JSON value.
 *
 * Returns a new value and never mutates `doc` or `patch`. If the patch is
 * invalid or any operation fails (including `test`), a JsonPatchError is
 * thrown and nothing is applied.
 */
export function applyJsonPatch(doc: Json, patch: unknown): Json {
  if (!Array.isArray(patch)) {
    throw new JsonPatchError('Invalid JSON Patch document: must be an array of operations')
  }
  // Validate everything up front so an invalid document is rejected as a whole
  const operations = patch.map((raw, i) => parseOperation(raw, i))
  let result = clone(doc)
  operations.forEach((operation, i) => {
    try {
      result = applyOperation(result, operation)
    } catch (e) {
      if (e instanceof JsonPatchError) {
        throw new JsonPatchError(`Operation ${i} (${operation.op}) failed: ${e.message}`)
      }
      throw e
    }
  })
  return result
}
