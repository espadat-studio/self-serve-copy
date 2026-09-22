// A field's name is a dotted path into the target file. A flat content model is the
// depth-1 case; array positions are literal segments, so list contents are addressable
// and list shape is not.
export type Holder = Record<string, unknown> | unknown[]

const isHolder = (value: unknown): value is Holder => typeof value === 'object' && value !== null

// Walks every segment but the last. An absent intermediate returns nothing rather than a
// path to create: the client edits words, never shape.
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

export function writePath(root: Holder, path: string, value: string): void {
  const found = holderOf(root, path)
  if (!found) throw new Error(`the target file has no path ${path}`)
  ;(found.holder as Record<string, unknown>)[found.leaf] = value
}
