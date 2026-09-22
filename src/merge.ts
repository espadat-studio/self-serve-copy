import type { EditableField } from './site'

export type FencedMerge = {
  merged: string
  dropped: string[]
}

type Holder = Record<string, unknown> | unknown[]

const isHolder = (value: unknown): value is Holder => typeof value === 'object' && value !== null

// Walks every segment but the last. An absent intermediate returns nothing rather than
// a path to create: the client edits words, never shape.
function holderOf(root: Holder, path: string): { holder: Holder; leaf: string } | undefined {
  const parts = path.split('.')
  const leaf = parts.pop() as string
  let holder: unknown = root

  for (const part of parts) {
    if (!isHolder(holder) || !(part in holder)) return undefined
    holder = (holder as Record<string, unknown>)[part]
  }

  return isHolder(holder) ? { holder, leaf } : undefined
}

export function readPath(root: Holder, path: string): unknown {
  const found = holderOf(root, path)
  return found && found.leaf in found.holder ? (found.holder as Record<string, unknown>)[found.leaf] : undefined
}

export function hasPath(root: Holder, path: string): boolean {
  const found = holderOf(root, path)
  return found !== undefined && found.leaf in found.holder
}

function writePath(root: Holder, path: string, value: string): void {
  const found = holderOf(root, path)
  if (!found) throw new Error(`the target file has no path ${path}`)
  ;(found.holder as Record<string, unknown>)[found.leaf] = value
}

// the client's own commit is the last gate before master, so a value that would red the
// build has to be refused here, where it is loud to us, rather than there, where it is
// silent to him
function accept(field: EditableField, value: unknown): string {
  if (typeof value !== 'string')
    throw new Error(`the incoming value of ${field.name} is ${typeof value}, not a string`)
  if (value.trim() === '')
    throw new Error(`the incoming value of ${field.name} is empty`)
  if (field.pattern && !new RegExp(field.pattern[0]).test(value))
    throw new Error(`the incoming value of ${field.name} breaks its guard — ${field.pattern[1]}`)
  return value
}

// The incoming file is flat whatever the target's shape: Decap's form is one level, so a
// nested field arrives keyed by its whole dotted path.
export function mergeFenced(
  fields: readonly EditableField[],
  currentJson: string,
  incomingJson: string,
): FencedMerge {
  const current = JSON.parse(currentJson) as Holder
  const incoming = JSON.parse(incomingJson) as Record<string, unknown>

  const absent = fields.filter((field) => !hasPath(current, field.name)).map((field) => field.name)
  if (absent.length > 0)
    throw new Error(`the target file is missing fenced keys, so no edit can be applied: ${absent.join(', ')}`)

  const fence = new Set(fields.map((field) => field.name))
  const dropped = Object.keys(incoming).filter((key) => !fence.has(key))

  const merged = structuredClone(current)
  for (const field of fields) {
    if (!(field.name in incoming)) continue
    writePath(merged, field.name, accept(field, incoming[field.name]))
  }

  return { merged: `${JSON.stringify(merged, null, 2)}\n`, dropped }
}
