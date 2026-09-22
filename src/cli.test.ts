import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = fileURLToPath(new URL('./cli.ts', import.meta.url))

const SITE = `export default {
  targetFile: 'target.json',
  fields: [
    { name: 'seo_title', label: 'Buscadores · Título', widget: 'string' },
    { name: 'about.body', label: 'Sobre mí · Primero', widget: 'text' },
  ],
  drift: { baselineFile: 'baseline.json', locales: ['en', 'fr'], refreshCommand: 'mise r baseline' },
}
`

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'self-serve-copy-'))
  writeFileSync(join(dir, 'site.ts'), SITE)
  writeFileSync(join(dir, 'target.json'), JSON.stringify({ seo_title: 'hola', about: { body: 'texto' } }, null, 2))
  writeFileSync(join(dir, 'baseline.json'), JSON.stringify({ seo_title: 'hola', 'about.body': 'texto' }))
  return dir
}

const run = (dir: string, ...args: string[]) =>
  Bun.spawnSync(['bun', CLI, ...args, '--config', 'site.ts'], { cwd: dir })

describe('the merge command', () => {
  test('applies a fenced edit to the target the site names', () => {
    const dir = workspace()
    writeFileSync(join(dir, 'in.json'), JSON.stringify({ seo_title: 'adiós', 'about.body': 'otro' }))
    expect(run(dir, 'merge', 'in.json').exitCode).toBe(0)
    expect(JSON.parse(readFileSync(join(dir, 'target.json'), 'utf8'))).toEqual({
      seo_title: 'adiós',
      about: { body: 'otro' },
    })
  })

  test('drops what the fence does not name, and says how many', () => {
    const dir = workspace()
    writeFileSync(join(dir, 'in.json'), JSON.stringify({ footer_credit: 'rewritten' }))
    const merged = run(dir, 'merge', 'in.json')
    expect(merged.stdout.toString()).toContain('dropped 1 key(s) outside the fence: footer_credit')
    expect(readFileSync(join(dir, 'target.json'), 'utf8')).not.toContain('footer_credit')
  })

  test('refuses an edit that breaks the fence, leaving the target alone', () => {
    const dir = workspace()
    const before = readFileSync(join(dir, 'target.json'), 'utf8')
    writeFileSync(join(dir, 'in.json'), JSON.stringify({ seo_title: '' }))
    expect(run(dir, 'merge', 'in.json').exitCode).not.toBe(0)
    expect(readFileSync(join(dir, 'target.json'), 'utf8')).toBe(before)
  })
})

describe('the drift command', () => {
  test('writes the report and prints the count, which is all a caller gates on', () => {
    const dir = workspace()
    writeFileSync(join(dir, 'target.json'), JSON.stringify({ seo_title: 'movido', about: { body: 'texto' } }))
    const drift = run(dir, 'drift', '--out', 'report.md')
    expect(drift.stdout.toString().trim()).toBe('1')
    expect(readFileSync(join(dir, 'report.md'), 'utf8')).toContain('- `seo_title`')
  })

  test('prints nothing but a zero while the locales are level', () => {
    const drift = run(workspace(), 'drift', '--out', 'report.md')
    expect(drift.stdout.toString().trim()).toBe('0')
  })
})

describe('the command line', () => {
  test('refuses a command it does not have', () => {
    const unknown = run(workspace(), 'publish')
    expect(unknown.exitCode).not.toBe(0)
    expect(unknown.stderr.toString()).toContain('usage: self-serve-copy')
  })

  test('refuses a config module that exports no site', () => {
    const dir = workspace()
    writeFileSync(join(dir, 'site.ts'), 'export const site = {}\n')
    expect(run(dir, 'merge', 'in.json').stderr.toString()).toContain('no default export')
  })
})
