import { existsSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import {
  ADMIN_ASSETS,
  adminAssetPath,
  adminConfigYaml,
  adminShellHtml,
  DECAP_SCRIPT,
  decapDistPath,
} from './admin-config'
import { EXAMPLE_SITE as SITE } from './site.fixture'

const config = adminConfigYaml(SITE)

describe('the CMS config', () => {
  test('names the collection, the file and then every field, and nothing else', () => {
    const named = [...config.matchAll(/^ +- name: (\S+)$/gm)].map(([, name]) => name)
    expect(named).toEqual(['textos', 'es', 'seo_title', 'about_body_1', 'hero_image_alt'])
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
    expect(() => adminConfigYaml({ ...SITE, collectionLabel: '# Textos' })).toThrow('needs YAML quoting')
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
