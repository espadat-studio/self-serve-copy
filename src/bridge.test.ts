import { describe, expect, test } from 'bun:test'
import { fetchCopy, pendingStatus, postStatus } from './bridge'
import type { SiteCopy } from './site'

const SITE = {
  forge: 'https://git.example.xyz',
  contentRepo: 'owner/content',
  contentBranch: 'master',
  contentFileName: 'es',
  siteUrl: 'https://example.com',
  statusContext: 'deploy/example.com',
  statusDescription: 'Publicando el cambio.',
} as SiteCopy

const answers = (status: number, body: unknown) => () =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))

const contents = (overrides: Record<string, unknown> = {}) => ({
  encoding: 'base64',
  content: Buffer.from('{"seo_title":"hola"}').toString('base64'),
  last_commit_sha: 'cafe1234',
  ...overrides,
})

describe('the forge fetch', () => {
  test('reads the file and the commit it came from', async () => {
    const outcome = await fetchCopy(SITE, 'token', answers(200, contents()))
    expect(outcome).toEqual({ fetched: true, sha: 'cafe1234', content: '{"seo_title":"hola"}' })
  })

  test('asks the contents endpoint, which is the only one carrying that commit', async () => {
    let asked = ''
    await fetchCopy(SITE, 'token', (url) => {
      asked = String(url)
      return Promise.resolve(new Response(JSON.stringify(contents())))
    })
    expect(asked).toBe('https://git.example.xyz/api/v1/repos/owner/content/contents/es.json?ref=master')
  })

  test('sends the token the forge authenticates by', async () => {
    let sent: string | null = null
    await fetchCopy(SITE, 'secret', (_url, init) => {
      sent = new Headers(init?.headers).get('Authorization')
      return Promise.resolve(new Response(JSON.stringify(contents())))
    })
    expect(sent).toBe('token secret')
  })

  // the poll is the retry: nothing is lost, and nothing is loud
  test.each([429, 500, 502, 503])('leaves %i to the next tick', async (status) => {
    const outcome = await fetchCopy(SITE, 'token', answers(status, {}))
    expect(outcome.fetched).toBe(false)
  })

  test('leaves an unreachable forge to the next tick', async () => {
    const outcome = await fetchCopy(SITE, 'token', () => Promise.reject(new Error('ECONNREFUSED')))
    expect(outcome).toEqual({ fetched: false, reason: 'the forge is unreachable; the next tick retries' })
  })

  // a redirect, an auth failure or a missing file is a misconfiguration, and no amount of
  // retrying fixes one quietly
  test.each([301, 401, 403, 404])('fails loudly on %i', async (status) => {
    expect(fetchCopy(SITE, 'token', answers(status, {}))).rejects.toThrow(String(status))
  })

  test('fails loudly when the forge sends something other than base64', async () => {
    expect(fetchCopy(SITE, 'token', answers(200, contents({ encoding: 'utf8' })))).rejects.toThrow('not base64')
  })

  // a null here would reach the commit trailer and 404 on statuses/ long after the push
  // has shipped
  test.each([null, undefined, ''])('fails loudly when last_commit_sha is %j', async (sha) => {
    expect(fetchCopy(SITE, 'token', answers(200, contents({ last_commit_sha: sha }))))
      .rejects
      .toThrow('last_commit_sha')
  })
})

describe('the status it posts', () => {
  test('is pending, and never a failure the client can see and cannot act on', () => {
    expect(pendingStatus(SITE).state).toBe('pending')
  })

  test('points at the site, which is where the client checks', () => {
    expect(pendingStatus(SITE).target_url).toBe('https://example.com')
    expect(pendingStatus(SITE).context).toBe('deploy/example.com')
  })

  test('lands on the client commit rather than the branch', async () => {
    let asked = ''
    await postStatus(SITE, 'token', 'cafe1234', (url) => {
      asked = String(url)
      return Promise.resolve(new Response('', { status: 201 }))
    })
    expect(asked).toBe('https://git.example.xyz/api/v1/repos/owner/content/statuses/cafe1234')
  })

  test('fails loudly when the forge refuses it', async () => {
    const refuse = () => Promise.resolve(new Response('no such commit', { status: 404 }))
    expect(postStatus(SITE, 'token', 'cafe1234', refuse)).rejects.toThrow('no such commit')
  })
})
