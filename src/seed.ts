import { createRequire } from 'node:module'
import { decapDistPath } from './admin-config'
import type { Fetcher } from './bridge'
import { type Holder, readPath } from './path-address'
import { contentFileOf, forgeApiOf, type SiteCopy } from './site'

// Decap's own Immutable, resolved beside the bundle rather than declared here, so the
// order below is the one the pinned Decap writes and cannot drift from it
const { fromJS } = createRequire(decapDistPath())('immutable') as {
  fromJS: (value: unknown) => { toJS: () => unknown }
}

// Flat, because Decap reads getIn(['data', name]): a dotted name is one key to it. In
// Decap's key order, because its Map hashes above 8 keys and the first save would
// otherwise reorder every line. Without a seed Decap opens an empty draft, and every
// required field is the client's to retype.
export function seedOf(site: SiteCopy, targetJson: string): string {
  const target = JSON.parse(targetJson) as Holder
  const seed = Object.fromEntries(site.fields.map(({ name }) => {
    const value = readPath(target, name)
    if (typeof value !== 'string') throw new Error(`the target file holds no text at ${name}, so there is nothing to seed`)
    return [name, value]
  }))
  return `${JSON.stringify(fromJS(seed).toJS(), null, 2)}\n`
}

export type SeedFile = {
  path: string
  // what is probed for existence: the media folder itself, so one already holding images
  // is left alone
  probe: string
  content: string
}

// The media folder too: Forgejo answers a tree read of an absent folder with "sha not
// found" rather than the 404 Decap handles, and Decap lists it on every entry load.
export const seedFiles = (site: SiteCopy, targetJson: string): SeedFile[] => [
  { path: contentFileOf(site), probe: contentFileOf(site), content: seedOf(site, targetJson) },
  { path: `${site.mediaFolder}/.gitkeep`, probe: site.mediaFolder, content: '' },
]

const TIMEOUT_MS = 30_000

export type SeedOutcome = { created: string[]; kept: string[] }

// Create-only. The content file holds the client's published words once she has saved,
// so a re-run keeps whatever is there and anything but a clean 404 stops the run.
export async function seedContentRepo(
  site: SiteCopy,
  token: string,
  targetJson: string,
  doFetch: Fetcher = fetch,
): Promise<SeedOutcome> {
  const outcome: SeedOutcome = { created: [], kept: [] }
  const headers = { Authorization: `token ${token}`, 'Content-Type': 'application/json' }

  for (const file of seedFiles(site, targetJson)) {
    const probe = await doFetch(`${forgeApiOf(site)}/contents/${file.probe}?ref=${site.contentBranch}`, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (probe.ok) {
      outcome.kept.push(file.path)
      continue
    }
    if (probe.status !== 404) throw new Error(`the forge answered ${probe.status} for ${file.probe}`)

    const created = await doFetch(`${forgeApiOf(site)}/contents/${file.path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        branch: site.contentBranch,
        content: Buffer.from(file.content).toString('base64'),
        message: `chore: seed ${file.path}`,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!created.ok) throw new Error(`the forge answered ${created.status} creating ${file.path}: ${await created.text()}`)
    outcome.created.push(file.path)
  }

  return outcome
}
