import { describe, expect, test } from 'bun:test'
import { detectDrift, recordBaseline, renderDriftReport } from './drift'
import type { EditableField, SiteCopy } from './site'

const FIELDS: EditableField[] = [
  { name: 'seo_title', label: 'Buscadores · Título', widget: 'string' },
  { name: 'about.body', label: 'Sobre mí · Primero', widget: 'text' },
]

const DRIFT: NonNullable<SiteCopy['drift']> = {
  baselineFile: 'messages/translation-baseline.json',
  locales: ['ca', 'de', 'en', 'fr'],
  refreshCommand: 'mise r translation-baseline -- <key>',
}

const target = (title: string, body: string) => JSON.stringify({ seo_title: title, about: { body } })

describe('the drift detector', () => {
  test('reports nothing while the base copy reads as the baseline recorded it', () => {
    const baseline = JSON.stringify({ seo_title: 'a', 'about.body': 'b' })
    expect(detectDrift(FIELDS, target('a', 'b'), baseline)).toEqual([])
  })

  test('names a key whose base copy has moved', () => {
    const baseline = JSON.stringify({ seo_title: 'a', 'about.body': 'b' })
    expect(detectDrift(FIELDS, target('moved', 'b'), baseline)).toEqual(['seo_title'])
  })

  // which is how a newly fenced key gets asked about once
  test('reads a key the baseline never recorded as drifted', () => {
    expect(detectDrift(FIELDS, target('a', 'b'), JSON.stringify({ seo_title: 'a' }))).toEqual(['about.body'])
  })

  test('follows a dotted path into the target rather than looking for a flat key', () => {
    const baseline = JSON.stringify({ seo_title: 'a', 'about.body': 'moved' })
    expect(detectDrift(FIELDS, target('a', 'b'), baseline)).toEqual(['about.body'])
  })
})

describe('the baseline', () => {
  const baseline = JSON.stringify({ seo_title: 'old' })

  test('records the base copy of the key it is given', () => {
    const recorded = JSON.parse(recordBaseline(FIELDS, target('new', 'b'), baseline, ['seo_title']))
    expect(recorded.seo_title).toBe('new')
  })

  test('records a nested value under its whole path', () => {
    const recorded = JSON.parse(recordBaseline(FIELDS, target('a', 'b'), baseline, ['about.body']))
    expect(recorded['about.body']).toBe('b')
  })

  test('leaves a key it was not given', () => {
    const recorded = JSON.parse(recordBaseline(FIELDS, target('new', 'b'), baseline, ['about.body']))
    expect(recorded.seo_title).toBe('old')
  })

  // so the diff shows only the values that moved, whatever order the caller named them in
  test('writes in fence order', () => {
    const full = JSON.stringify({ 'about.body': 'b', seo_title: 'a' })
    const recorded = recordBaseline(FIELDS, target('a', 'b'), full, ['about.body', 'seo_title'])
    expect(Object.keys(JSON.parse(recorded))).toEqual(['seo_title', 'about.body'])
  })

  test('refuses a key outside the fence, since no translation waits on one', () => {
    expect(() => recordBaseline(FIELDS, target('a', 'b'), baseline, ['footer_credit'])).toThrow('footer_credit')
  })

  test('refuses a key the target file carries nothing for', () => {
    expect(() => recordBaseline(FIELDS, JSON.stringify({ seo_title: 'a' }), baseline, ['about.body']))
      .toThrow('about.body')
  })
})

describe('the drift report', () => {
  test('says so plainly when the locales are level', () => {
    const report = renderDriftReport(FIELDS, [], DRIFT)
    expect(report).toContain('Nothing to refresh')
    expect(report).toContain('`ca`, `de`, `en` and `fr`')
  })

  test('names each drifted key with the label the client reads', () => {
    const report = renderDriftReport(FIELDS, ['about.body'], DRIFT)
    expect(report).toContain('- `about.body` — Sobre mí · Primero')
    expect(report).not.toContain('`seo_title`')
  })

  test('quotes the command that clears a key, which differs per site', () => {
    expect(renderDriftReport(FIELDS, ['seo_title'], DRIFT)).toContain('`mise r translation-baseline -- <key>`')
  })

  test('counts the locales it is reporting on', () => {
    const two = { ...DRIFT, locales: ['en', 'fr'] }
    expect(renderDriftReport(FIELDS, ['seo_title'], two)).toContain('so those 2 now say the old thing')
    expect(renderDriftReport(FIELDS, ['seo_title'], two)).toContain('`en` and `fr`')
  })

  test('says nothing that could fail a build, since it is written to an issue', () => {
    expect(renderDriftReport(FIELDS, ['seo_title'], DRIFT)).toContain('Nothing here fails a build')
  })
})
