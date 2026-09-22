import { contentFileOf, forgeApiOf, type SiteCopy } from './site'

export type Fetcher = typeof fetch

export type FetchOutcome =
  | { fetched: true; sha: string; content: string }
  // the poll is the retry: a tick that cannot reach the forge says so and stops, and the
  // next one five minutes later picks the edit up. Nothing is lost and nothing is loud.
  | { fetched: false; reason: string }

const TIMEOUT_MS = 30_000

const transient = (status: number): boolean => status === 429 || status >= 500

export async function fetchCopy(site: SiteCopy, token: string, doFetch: Fetcher = fetch): Promise<FetchOutcome> {
  // contents/ rather than raw/, because it carries the commit the bytes came from. The
  // status this run publishes has to land on the client's own commit, and resolving that
  // separately would race a publish arriving mid-run.
  const url = `${forgeApiOf(site)}/contents/${contentFileOf(site)}?ref=${site.contentBranch}`

  let response: Response
  try {
    response = await doFetch(url, {
      headers: { Authorization: `token ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    return { fetched: false, reason: 'the forge is unreachable; the next tick retries' }
  }

  if (!response.ok) {
    if (transient(response.status))
      return { fetched: false, reason: `the forge answered ${response.status}; the next tick retries` }
    // a redirect, an auth failure or a missing file is a misconfiguration, and no amount
    // of retrying fixes one quietly
    throw new Error(`the forge answered ${response.status}`)
  }

  const body = await response.json() as { encoding?: unknown; content?: unknown; last_commit_sha?: unknown }

  if (body.encoding !== 'base64')
    throw new Error(`the forge sent ${String(body.encoding)} content, not base64`)
  // checked rather than trusted: a null here would reach the commit trailer and 404 on
  // statuses/ long after the push has shipped
  if (typeof body.last_commit_sha !== 'string' || body.last_commit_sha === '')
    throw new Error('the forge sent no last_commit_sha')
  if (typeof body.content !== 'string')
    throw new Error('the forge sent no content')

  return {
    fetched: true,
    sha: body.last_commit_sha,
    content: Buffer.from(body.content, 'base64').toString('utf8'),
  }
}

// pending, and never failure. A red mark on his own commit is something the client cannot
// act on; a failure leaves this pending and tells the developer another way.
export const pendingStatus = (site: SiteCopy) => ({
  state: 'pending',
  context: site.statusContext,
  description: site.statusDescription,
  target_url: site.siteUrl,
})

export async function postStatus(
  site: SiteCopy,
  token: string,
  sha: string,
  doFetch: Fetcher = fetch,
): Promise<void> {
  const response = await doFetch(`${forgeApiOf(site)}/statuses/${sha}`, {
    method: 'POST',
    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(pendingStatus(site)),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`the forge answered ${response.status} to the status post: ${await response.text()}`)
}
