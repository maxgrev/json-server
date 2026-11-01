// Minimal RFC 6902 (JSON Patch) engine built on RFC 6901 (JSON Pointer).
//
// applyJsonPatch never mutates its input: operations run on a deep clone,
// which is returned only if every operation succeeds (atomic by construction).

export type JsonPatchErrorKind = 'invalid' | 'conflict'

/**
 * - 'invalid':  the patch document itself is malformed (bad shape, unknown op,
 *               missing member, malformed pointer).
 * - 'conflict': the patch is well-formed but cannot be applied to the document
 *               (missing path, failed test, bad array index...).
 */
export class JsonPatchError extends Error {
  kind: JsonPatchErrorKind

  constructor(kind: JsonPatchErrorKind, message: string) {
    super(message)
    this.name = 'JsonPatchError'
    this.kind = kind
  }
}

type Json = unknown
type Container = Record<string, Json> | Json[]

const OPS = ['add', 'remove', 'replace', 'move', 'copy', 'test'] as const
type OpName = (typeof OPS)[number]

type Operation =
  | { op: 'add' | 'replace' | 'test'; path: string[]; value: Json }
  | { op: 'remove'; path: string[] }
  | { op: 'move' | 'copy'; path: string[]; from: string[] }

const invalid = (message: string) => new JsonPatchError('invalid', message)
const conflict = (message: string) => new JsonPatchError('conflict', message)

const hasOwn = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key)

function isPlainObject(value: unknown): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// RFC 6901: "" is the whole document, otherwise "/"-separated tokens where
// "~1" means "/" and "~0" means "~".
function parsePointer(pointer: string, member: string): string[] {
  if (pointer === '') return []
  if (!pointer.startsWith('/')) {
    throw invalid(`"${member}" must be a valid JSON Pointer`)
  }
  return pointer
    .slice(1)
    .split('/')
    .map((token) => {
      if (/~(?![01])/.test(token)) {
        throw invalid(`"${member}" contains an invalid escape sequence`)
      }
      return token.replace(/~1/g, '/').replace(/~0/g, '~')
    })
}

function validate(ops: unknown): Operation[] {
  if (!Array.isArray(ops)) {
    throw invalid('Patch must be an array of operations')
  }
  return ops.map((raw: unknown, i): Operation => {
    const at = `operation ${i}`
    if (!isPlainObject(raw)) throw invalid(`${at}: must be an object`)
    const op = raw['op']
    if (typeof op !== 'string' || !OPS.includes(op as OpName)) {
      throw invalid(`${at}: unknown or missing "op"`)
    }
    if (typeof raw['path'] !== 'string') {
      throw invalid(`${at}: "path" must be a string`)
    }
    const path = parsePointer(raw['path'], 'path')

    switch (op as OpName) {
      case 'add':
      case 'replace':
      case 'test':
        if (!hasOwn(raw, 'value') || raw['value'] === undefined) {
          throw invalid(`${at}: "value" is required`)
        }
        return {
          op: op as 'add' | 'replace' | 'test',
          path,
          value: raw['value'],
        }
      case 'remove':
        return { op: 'remove', path }
      case 'move':
      case 'copy':
        if (typeof raw['from'] !== 'string') {
          throw invalid(`${at}: "from" must be a string`)
        }
        return {
          op: op as 'move' | 'copy',
          path,
          from: parsePointer(raw['from'], 'from'),
        }
    }
  })
}

function isArrayIndex(token: string): boolean {
  return /^(0|[1-9]\d*)$/.test(token)
}

// Resolves a container's child for reading. Only own properties are visible,
// so prototype keys such as "__proto__" or "constructor" can never be reached.
function getChild(parent: Container, token: string, pointer: string): Json {
  if (Array.isArray(parent)) {
    if (!isArrayIndex(token) || Number(token) >= parent.length) {
      throw conflict(`Path not found: ${pointer}`)
    }
    return parent[Number(token)]
  }
  if (!hasOwn(parent, token)) throw conflict(`Path not found: ${pointer}`)
  return parent[token]
}

function toPointer(tokens: string[]): string {
  return tokens.map((t) => '/' + t.replace(/~/g, '~0').replace(/\//g, '~1')).join('')
}

function get(doc: Json, tokens: string[]): Json {
  let current = doc
  for (let i = 0; i < tokens.length; i++) {
    if (typeof current !== 'object' || current === null) {
      throw conflict(`Path not found: ${toPointer(tokens)}`)
    }
    current = getChild(current as Container, tokens[i]!, toPointer(tokens))
  }
  return current
}

// Returns the container holding the last token of `tokens`.
function getParent(doc: Json, tokens: string[]): Container {
  const parent = get(doc, tokens.slice(0, -1))
  if (typeof parent !== 'object' || parent === null) {
    throw conflict(`Path not found: ${toPointer(tokens)}`)
  }
  return parent as Container
}

function setOwn(obj: Record<string, Json>, key: string, value: Json) {
  // defineProperty avoids triggering the "__proto__" setter.
  Object.defineProperty(obj, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  })
}

function add(doc: Json, tokens: string[], value: Json): Json {
  if (tokens.length === 0) return value
  const parent = getParent(doc, tokens)
  const key = tokens[tokens.length - 1]!
  if (Array.isArray(parent)) {
    if (key === '-') {
      parent.push(value)
    } else if (isArrayIndex(key) && Number(key) <= parent.length) {
      parent.splice(Number(key), 0, value)
    } else {
      throw conflict(`Invalid array index: ${toPointer(tokens)}`)
    }
  } else {
    setOwn(parent, key, value)
  }
  return doc
}

function remove(doc: Json, tokens: string[]): Json {
  if (tokens.length === 0) {
    throw conflict('Cannot remove the root of the document')
  }
  const parent = getParent(doc, tokens)
  const key = tokens[tokens.length - 1]!
  // Validates existence (own key / in-range index).
  getChild(parent, key, toPointer(tokens))
  if (Array.isArray(parent)) {
    parent.splice(Number(key), 1)
  } else {
    delete parent[key]
  }
  return doc
}

function replace(doc: Json, tokens: string[], value: Json): Json {
  if (tokens.length === 0) return value
  const parent = getParent(doc, tokens)
  const key = tokens[tokens.length - 1]!
  getChild(parent, key, toPointer(tokens))
  if (Array.isArray(parent)) {
    parent[Number(key)] = value
  } else {
    setOwn(parent, key, value)
  }
  return doc
}

function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => deepEqual(v, b[i]))
    )
  }
  const ao = a as Record<string, Json>
  const bo = b as Record<string, Json>
  const keys = Object.keys(ao)
  return (
    keys.length === Object.keys(bo).length &&
    keys.every((k) => hasOwn(bo, k) && deepEqual(ao[k], bo[k]))
  )
}

function isPrefix(prefix: string[], tokens: string[]): boolean {
  return prefix.length < tokens.length && prefix.every((t, i) => t === tokens[i])
}

function applyOperation(doc: Json, operation: Operation): Json {
  switch (operation.op) {
    case 'add':
      return add(doc, operation.path, structuredClone(operation.value))
    case 'replace':
      // The target must exist.
      get(doc, operation.path)
      return replace(doc, operation.path, structuredClone(operation.value))
    case 'remove':
      return remove(doc, operation.path)
    case 'test':
      if (!deepEqual(get(doc, operation.path), operation.value)) {
        throw conflict(`Test failed at ${toPointer(operation.path)}`)
      }
      return doc
    case 'copy': {
      const value = structuredClone(get(doc, operation.from))
      return add(doc, operation.path, value)
    }
    case 'move': {
      const { from, path } = operation
      const value = get(doc, from)
      if (from.length === path.length && from.every((t, i) => t === path[i])) {
        return doc
      }
      if (isPrefix(from, path)) {
        throw conflict('Cannot move a value into one of its own children')
      }
      return add(remove(doc, from), path, value)
    }
  }
}

/**
 * Applies an RFC 6902 patch document to `doc` and returns the patched copy.
 * `doc` is never mutated. Throws JsonPatchError ('invalid' or 'conflict') and
 * returns nothing if any operation fails.
 */
export function applyJsonPatch<T = unknown>(doc: T, ops: unknown): T {
  const operations = validate(ops)
  let result: Json = structuredClone(doc)
  for (const operation of operations) {
    result = applyOperation(result, operation)
  }
  return result as T
}
