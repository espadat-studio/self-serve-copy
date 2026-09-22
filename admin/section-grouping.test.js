import { describe, expect, test } from 'bun:test'
import preview from './preview.js' with { type: 'text' }
import { groupFieldsBySection, UNGROUPED } from './section-grouping.js'

describe('the grouping', () => {
  test('keeps a label that carries no separator, under the fallback section', () => {
    const grouped = groupFieldsBySection([{ name: 'loose', label: 'Sin sección' }])
    expect(grouped).toEqual([{ section: UNGROUPED, fields: [{ name: 'loose', label: 'Sin sección' }] }])
  })

  test('splits on the first separator only, so a label may contain another', () => {
    const grouped = groupFieldsBySection([{ name: 'deep', label: 'Portada · Titular · segunda parte' }])
    expect(grouped[0].section).toBe('Portada')
    expect(grouped[0].fields[0].label).toBe('Titular · segunda parte')
  })

  test('gathers fields of one section that are declared apart', () => {
    const grouped = groupFieldsBySection([
      { name: 'a', label: 'Uno · a' },
      { name: 'b', label: 'Dos · b' },
      { name: 'c', label: 'Uno · c' },
    ])
    expect(grouped.map((group) => group.section)).toEqual(['Uno', 'Dos'])
    expect(grouped[0].fields.map((field) => field.name)).toEqual(['a', 'c'])
  })

  test('keeps the fields of a section in the order they were declared', () => {
    const grouped = groupFieldsBySection([{ name: 'a', label: 'Uno · a' }, { name: 'b', label: 'Uno · b' }])
    expect(grouped[0].fields.map((field) => field.name)).toEqual(['a', 'b'])
  })
})

describe('the preview registration', () => {
  // Registered under a name Decap cannot resolve, the template is never found and Decap
  // silently renders its own default pane — no error, no console warning, just a worse
  // preview. Nothing else would catch that.
  test('takes the file name from the shell rather than hardcoding one site', () => {
    expect(preview).toContain('registerPreviewTemplate(window.SELF_SERVE_COPY_FILE')
    expect(preview).not.toMatch(/registerPreviewTemplate\('/)
  })

  test('registers the stylesheet it ships beside itself', () => {
    expect(preview).toContain("registerPreviewStyle('preview.css')")
  })
})
