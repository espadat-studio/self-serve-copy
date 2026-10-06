import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import {
  ADMIN_ASSETS,
  adminAssetPath,
  adminConfigYaml,
  adminShellHtml,
  DECAP_SCRIPT,
  decapDistPath,
} from './admin-config'
import type { EditableField } from './site'
import { EXAMPLE_SITE as SITE } from './site.fixture'

const config = adminConfigYaml(SITE)

const collectionsIn = (yaml: string) =>
  yaml.split(/^ {2}- name: /m).slice(1).map((block) => ({
    name: block.slice(0, block.indexOf('\n')),
    label: block.match(/^ {4}label: (.+)$/m)?.[1],
    entries: [...block.matchAll(/^ {6}- name: (\S+)\n {8}label: .+\n {8}file: (\S+)$/gm)].map(([, name, file]) => ({ name, file })),
    fields: [...block.matchAll(/^ {10}- name: (\S+)$/gm)].map(([, name]) => name),
  }))

const withLabels = (...labels: string[]): EditableField[] =>
  labels.map((label, index) => ({ name: `key_${index}`, label, widget: 'string' }))

describe('the CMS config', () => {
  test('names each section, its file and then its fields, and nothing else', () => {
    const named = [...config.matchAll(/^ +- name: (\S+)$/gm)].map(([, name]) => name)
    expect(named).toEqual(['buscadores', 'es', 'seo_title', 'sobre-mi', 'es', 'about_body_1', 'portada', 'es', 'hero_image_alt'])
  })

  test('gives each section its own collection, in the order its first label appears', () => {
    const fields = withLabels('Uno · a', 'Dos · b', 'Uno · c', 'Tres · d')
    const collections = collectionsIn(adminConfigYaml({ ...SITE, fields }))
    expect(collections.map(({ name, fields }) => [name, fields])).toEqual([
      ['uno', ['key_0', 'key_2']],
      ['dos', ['key_1']],
      ['tres', ['key_3']],
    ])
  })

  test('labels each collection with its section', () => {
    expect(collectionsIn(config).map(({ label }) => label)).toEqual(['Buscadores', 'Sobre mí', 'Portada'])
  })

  // a files collection slugs a loaded entry by the first file entry on its path, so sections
  // sharing one collection would all list as the first; one apiece keeps each reachable
  test('holds one file entry per collection', () => {
    expect(collectionsIn(config).map(({ entries }) => entries.length)).toEqual([1, 1, 1])
  })

  // one content file, so the bridge, fetch and merge see no difference; Decap keeps the keys
  // an entry does not declare, so saving one section leaves the others as they were
  test('points every entry at the one content file', () => {
    expect(collectionsIn(config).flatMap(({ entries }) => entries.map(({ file }) => file))).toEqual(
      ['es.json', 'es.json', 'es.json'],
    )
  })

  // the preview resolves its template by the file entry's name, so one name serves them all
  test('names every file entry as the site does, so the preview renders for each', () => {
    expect(collectionsIn(config).flatMap(({ entries }) => entries.map(({ name }) => name))).toEqual(['es', 'es', 'es'])
  })

  test('gathers the fields with no section into one collection, where the first of them sits', () => {
    const fields = withLabels('Uno · a', 'suelto', 'Dos · b', 'otro suelto')
    const collections = collectionsIn(adminConfigYaml({ ...SITE, fields }))
    expect(collections.map(({ name, fields }) => [name, fields])).toEqual([
      ['uno', ['key_0']],
      ['otros', ['key_1', 'key_3']],
      ['dos', ['key_2']],
    ])
  })

  test('refuses two sections whose names would collide, rather than merging them', () => {
    expect(() => adminConfigYaml({ ...SITE, fields: withLabels('Sobre mí · a', 'Sobre mi · b') })).toThrow(
      'sobre-mi',
    )
  })

  test('refuses a section whose label leaves nothing to name its collection by', () => {
    expect(() => adminConfigYaml({ ...SITE, fields: withLabels('Uno · a', '¿? · b') })).toThrow('¿?')
  })

  // a site with one section keeps its collection name, so its panel URLs are unchanged
  test('keeps a single-section site exactly as it was', () => {
    const fields = SITE.fields.map((entry) => ({ ...entry, label: `Portada · ${entry.label.split(' · ')[1]}` }))
    const expected = readFileSync(new URL('one-section.fixture.yml', import.meta.url), 'utf8')
    expect(adminConfigYaml({ ...SITE, fields })).toBe(expected)
  })

  test('renders every field as required, so no edit can empty a key', () => {
    expect(config.match(/^ +required: true$/gm)).toHaveLength(SITE.fields.length)
    expect(config).not.toContain('required: false')
  })

  test('fixes the field list: no widget adds or removes a key', () => {
    expect(config).not.toMatch(/widget: (list|object|relation|hidden)/)
  })

  test('commits straight to the branch, with no review gate the client cannot pass', () => {
    expect(config).not.toContain('publish_mode')
  })

  test('declares every top-level property Decap requires, or it refuses to load', () => {
    expect(config).toMatch(/^backend:$/m)
    expect(config).toMatch(/^collections:$/m)
    expect(config).toMatch(/^(media_folder|media_library):/m)
  })

  test('points the backend at the site it was given', () => {
    expect(config).toContain('base_url: https://git.example.xyz')
    expect(config).toContain('api_root: https://git.example.xyz/api/v1')
    expect(config).toContain('repo: owner/content')
    expect(config).toContain('file: es.json')
  })

  test('carries a pattern and its message across as a two-item list', () => {
    expect(config).toContain('pattern:\n              - .*\\{years\\}.*\n              - Deja {years}')
  })

  // this writer emits bare scalars; a value YAML would read as something else has to stop
  // the build rather than reach the client as a broken panel
  test('refuses a value that would need quoting rather than emitting it bare', () => {
    expect(() => adminConfigYaml({ ...SITE, fileLabel: '# Textos' })).toThrow('needs YAML quoting')
    expect(() => adminConfigYaml({ ...SITE, mediaFolder: 'no' })).toThrow('needs YAML quoting')
  })
})

describe('the admin shell', () => {
  const shell = adminShellHtml(SITE)

  test('carries the title and language the site gave it', () => {
    expect(shell).toContain('<title>Textos de la web · Example</title>')
    expect(shell).toContain('<html lang="es">')
  })

  test('keeps the panel out of the index', () => {
    expect(shell).toContain('noindex, nofollow')
  })

  test('asks for the bundle by the name the build writes it under', () => {
    expect(shell).toContain(`src="${DECAP_SCRIPT}"`)
  })

  test('loads Decap from this origin, leaving no integrity hash behind to go stale', () => {
    expect(shell).not.toContain('unpkg.com')
    expect(shell).not.toContain('integrity=')
  })

  // a files collection resolves its preview template by the file's name; the shell is the
  // only site-aware part of the panel, so it is what tells preview.js which name to use
  test('declares the file name the preview registers under', () => {
    expect(shell).toContain('window.SELF_SERVE_COPY_FILE = "es"')
  })

  test('escapes a title that would otherwise close the tag', () => {
    expect(adminShellHtml({ ...SITE, title: 'A <b> & B' })).toContain('<title>A &lt;b&gt; &amp; B</title>')
  })

  test('escapes a value that would otherwise break out of its attribute', () => {
    expect(adminShellHtml({ ...SITE, lang: 'es" onload="x' })).toContain('<html lang="es&quot; onload=&quot;x">')
  })
})

describe('the files the build copies', () => {
  for (const name of ADMIN_ASSETS) {
    test(`ships ${name} beside the shell`, () => {
      expect(existsSync(adminAssetPath(name))).toBe(true)
    })
  }

  test('resolves the Decap bundle from the version this package pins', () => {
    expect(existsSync(decapDistPath())).toBe(true)
  })
})
