import { describe, expect, test } from 'bun:test'
import { mergeFenced } from './merge'
import type { EditableField } from './site'

const field = (name: string, extra: Partial<EditableField> = {}): EditableField => ({
  name,
  label: name,
  widget: 'string',
  ...extra,
})

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

describe('the merge, flat', () => {
  const fields = [field('seo_title'), field('seo_description')]
  const current = json({ $schema: 'x', seo_title: 'current', seo_description: 'current' })

  test('applies the incoming value of a fenced key', () => {
    const { merged } = mergeFenced(fields, current, json({ seo_title: 'edited' }))
    expect(JSON.parse(merged).seo_title).toBe('edited')
  })

  test('leaves a fenced key the incoming file does not carry', () => {
    const { merged } = mergeFenced(fields, current, json({ seo_title: 'edited' }))
    expect(JSON.parse(merged).seo_description).toBe('current')
  })

  test('drops a key outside the fence instead of merging it, and names it', () => {
    const { merged, dropped } = mergeFenced(fields, current, json({ footer_credit: 'rewritten' }))
    expect(JSON.parse(merged)).not.toHaveProperty('footer_credit')
    expect(dropped).toEqual(['footer_credit'])
  })

  test('keeps the target file byte for byte when the incoming copy changes nothing', () => {
    expect(mergeFenced(fields, current, current).merged).toBe(current)
  })

  test('changes one line and nothing else when one fenced key is edited', () => {
    const { merged } = mergeFenced(fields, current, json({ seo_title: 'un titular nuevo' }))
    const changed = merged.split('\n').filter((line, i) => line !== current.split('\n')[i])
    expect(changed).toHaveLength(1)
    expect(changed[0]).toContain('un titular nuevo')
  })
})

describe('the merge, nested', () => {
  const fields = [field('accueil.hero.titre'), field('parcours.1.annee')]
  const current = json({
    accueil: { hero: { titre: 'current', sous_titre: 'untouched' } },
    parcours: [{ annee: '2019' }, { annee: '2021' }],
  })

  test('writes the leaf a dotted path addresses', () => {
    const { merged } = mergeFenced(fields, current, json({ 'accueil.hero.titre': 'edited' }))
    expect(JSON.parse(merged).accueil.hero.titre).toBe('edited')
  })

  test('leaves a sibling of the leaf alone', () => {
    const { merged } = mergeFenced(fields, current, json({ 'accueil.hero.titre': 'edited' }))
    expect(JSON.parse(merged).accueil.hero.sous_titre).toBe('untouched')
  })

  test('addresses an array position by its literal index', () => {
    const { merged } = mergeFenced(fields, current, json({ 'parcours.1.annee': '2022' }))
    expect(JSON.parse(merged).parcours.map((entry: { annee: string }) => entry.annee)).toEqual(['2019', '2022'])
  })

  test('keeps the target file byte for byte when the incoming copy changes nothing', () => {
    expect(mergeFenced(fields, current, current).merged).toBe(current)
  })
})

describe('the merge, failing loudly', () => {
  const fields = [field('seo_title'), field('seo_description')]
  const current = json({ seo_title: 'current', seo_description: 'current' })

  test('refuses a target file missing a fenced key, naming it', () => {
    expect(() => mergeFenced(fields, json({ seo_title: 'current' }), json({}))).toThrow('seo_description')
  })

  test('names every fenced key the target file is missing, not just the first', () => {
    expect(() => mergeFenced(fields, json({}), json({}))).toThrow(/seo_title.*seo_description/)
  })

  // the client edits words, never shape: a path whose parent does not exist is a fence
  // that no longer matches the file, not an instruction to build the parent
  test('refuses an absent intermediate rather than creating it', () => {
    const nested = [field('accueil.hero.titre')]
    expect(() => mergeFenced(nested, json({ accueil: {} }), json({}))).toThrow('accueil.hero.titre')
  })

  test('refuses an index past the end of an array', () => {
    const nested = [field('parcours.4.annee')]
    expect(() => mergeFenced(nested, json({ parcours: [{ annee: '2019' }] }), json({}))).toThrow('parcours.4.annee')
  })

  test('refuses a non-string value for a fenced key, naming it', () => {
    expect(() => mergeFenced(fields, current, '{"seo_title": 42}')).toThrow('seo_title')
  })

  test.each(['', '   '])('refuses the empty value %j, which would red the build on master', (value) => {
    expect(() => mergeFenced(fields, current, json({ seo_title: value }))).toThrow('seo_title')
  })

  test('refuses a value that breaks its guard, quoting the guard the client was shown', () => {
    const guarded = [field('about_body_1', { pattern: ['.*\\{years\\}.*', 'Deja escrito {years}'] })]
    const target = json({ about_body_1: 'Llevo {years} anos.' })
    expect(() => mergeFenced(guarded, target, json({ about_body_1: 'Llevo veinte anos.' })))
      .toThrow(/about_body_1[\s\S]*\{years\}/)
  })

  test('applies a value that satisfies its guard', () => {
    const guarded = [field('about_body_1', { pattern: ['.*\\{years\\}.*', 'Deja escrito {years}'] })]
    const target = json({ about_body_1: 'Llevo {years} anos.' })
    const { merged } = mergeFenced(guarded, target, json({ about_body_1: 'Llevo {years} anos de oficio.' }))
    expect(JSON.parse(merged).about_body_1).toBe('Llevo {years} anos de oficio.')
  })
})
