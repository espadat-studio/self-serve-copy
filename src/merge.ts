import { hasPath, type Holder, writePath } from './path-address'
import type { EditableField } from './site'

export type FencedMerge = {
  merged: string
  dropped: string[]
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

  // structuredClone rather than a hand-rolled copy: it preserves insertion order at every
  // depth, which is what keeps an unchanged target byte for byte identical
  const merged = structuredClone(current)
  for (const field of fields) {
    if (!(field.name in incoming)) continue
    writePath(merged, field.name, accept(field, incoming[field.name]))
  }

  return { merged: `${JSON.stringify(merged, null, 2)}\n`, dropped }
}
