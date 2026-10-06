import { describe, expect, test } from 'bun:test'
import type { Fetcher } from './bridge'
import { seedContentRepo, seedFiles, seedOf } from './seed'
import { EXAMPLE_SITE } from './site.fixture'
import type { EditableField } from './site'

const NESTED = { ...EXAMPLE_SITE, fields: [{ name: 'about.body', label: 'Sobre mí · Primero', widget: 'text' }] as const }
const target = JSON.stringify({ seo_title: 'hola', about: { body: 'texto', extra: 'fuera' }, about_body_1: 'a {years}' })

describe('the seed', () => {
  // Decap reads getIn(['data', name]): a dotted name is one key to it, never a walk
  test('is flat, one key per fenced path, holding the target value', () => {
    expect(JSON.parse(seedOf(NESTED, target))).toEqual({ 'about.body': 'texto' })
  })

  test('carries nothing outside the fence', () => {
    expect(Object.keys(JSON.parse(seedOf(NESTED, target)))).toEqual(['about.body'])
  })

  test('refuses a fenced path the target does not hold, rather than seeding a blank', () => {
    expect(() => seedOf({ ...NESTED, fields: [{ name: 'about.missing', label: 'x', widget: 'string' }] }, target))
      .toThrow('about.missing')
  })

  // Immutable keeps insertion order to 8 keys and hashes above: seeded in any other order,
  // the client's first save is a diff of every line rather than of the one she changed
  test('is already in the order the first save writes back', () => {
    const fields: EditableField[] = Array.from({ length: 12 }, (_, i) => ({ name: `k${i}`, label: `S · ${i}`, widget: 'string' }))
    const wide = JSON.stringify(Object.fromEntries(fields.map(({ name }) => [name, name])))
    const seed = seedOf({ ...EXAMPLE_SITE, fields }, wide)
    expect(Object.keys(JSON.parse(seed))).not.toEqual(fields.map(({ name }) => name))
    expect(seedOf({ ...EXAMPLE_SITE, fields: Object.keys(JSON.parse(seed)).map((name) => ({ name, label: 'S · x', widget: 'string' })) }, seed)).toBe(seed)
  })

  test('is written as Decap writes JSON: two spaces and a trailing newline', () => {
    expect(seedOf(NESTED, target)).toBe('{\n  "about.body": "texto"\n}\n')
  })
})

describe('the seeded files', () => {
  // Forgejo answers a tree read of an absent folder with "sha not found", not the 404
  // Decap handles, so every entry fails to load until the media folder exists
  test('are the content file and the media folder Decap lists on every entry load', () => {
    expect(seedFiles(NESTED, target).map(({ path }) => path)).toEqual(['es.json', 'img/.gitkeep'])
  })
})

type Call = { method: string; url: string; body?: { content: string; branch: string } }

const forge = (existing: string[]) => {
  const calls: Call[] = []
  const doFetch: Fetcher = (url, init) => {
    const method = init?.method ?? 'GET'
    calls.push({ method, url, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) })
    if (method === 'GET') return Promise.resolve(new Response('{}', { status: existing.some((path) => url.includes(`/contents/${path}?`)) ? 200 : 404 }))
    return Promise.resolve(new Response('{}', { status: 201 }))
  }
  return { calls, doFetch }
}

describe('seeding the content repository', () => {
  test('creates what is missing, on the content branch', async () => {
    const { calls, doFetch } = forge([])
    expect(await seedContentRepo(NESTED, 'token', target, doFetch)).toEqual({ created: ['es.json', 'img/.gitkeep'], kept: [] })
    const posts = calls.filter(({ method }) => method === 'POST')
    expect(posts.map(({ url }) => url)).toEqual([
      'https://git.example.xyz/api/v1/repos/owner/content/contents/es.json',
      'https://git.example.xyz/api/v1/repos/owner/content/contents/img/.gitkeep',
    ])
    expect(Buffer.from(posts[0]?.body?.content ?? '', 'base64').toString()).toBe(seedOf(NESTED, target))
    expect(posts.every(({ body }) => body?.branch === 'master')).toBe(true)
  })

  // that file holds the client's published words: a re-run must never put the
  // developer's back over them
  test('never overwrites a file already there', async () => {
    const { calls, doFetch } = forge(['es.json'])
    expect(await seedContentRepo(NESTED, 'token', target, doFetch)).toEqual({ created: ['img/.gitkeep'], kept: ['es.json'] })
    expect(calls.filter(({ method, url }) => method === 'POST' && url.endsWith('es.json'))).toEqual([])
  })

  test('checks the media folder itself, so a folder holding images counts as there', async () => {
    const { calls, doFetch } = forge(['img'])
    expect((await seedContentRepo(NESTED, 'token', target, doFetch)).kept).toContain('img/.gitkeep')
    expect(calls.some(({ url }) => url.includes('/contents/img?ref=master'))).toBe(true)
  })

  test.each([401, 403, 500])('fails loudly on %i, since a guess here could overwrite', async (status) => {
    const doFetch: Fetcher = () => Promise.resolve(new Response('{}', { status }))
    expect(seedContentRepo(NESTED, 'token', target, doFetch)).rejects.toThrow(String(status))
  })
})
