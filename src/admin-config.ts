import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { groupFieldsBySection } from '../admin/section-grouping.js'
import { contentFileOf, type EditableField, type SiteCopy } from './site'

export const ADMIN_CONFIG_FILE = 'config.yml'
export const ADMIN_SHELL_FILE = 'index.html'
export const DECAP_SCRIPT = 'decap-cms.js'

// Copied beside the shell as they are; nothing in them is site-specific.
export const ADMIN_ASSETS = ['preview.js', 'preview.css', 'section-grouping.js'] as const

export const adminAssetPath = (name: (typeof ADMIN_ASSETS)[number]): string =>
  fileURLToPath(new URL(`../admin/${name}`, import.meta.url))

export const decapDistPath = (): string =>
  createRequire(import.meta.url).resolve(`decap-cms/dist/${DECAP_SCRIPT}`)

const NEEDS_QUOTING = /^[-?:,[\]{}#&*!|>'"%@`]|: | #|^\s|\s$/
const READS_AS_NON_STRING =
  /^(y|Y|yes|Yes|YES|n|N|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF|null|Null|NULL|~|[-+]?[0-9_.]+([eE][-+]?[0-9]+)?)$/

function scalar(value: string): string {
  if (NEEDS_QUOTING.test(value) || READS_AS_NON_STRING.test(value))
    throw new Error(`admin config value needs YAML quoting, which this writer does not do: ${value}`)
  return value
}

function field(entry: EditableField, indent: string): string[] {
  const lines = [
    `${indent}- name: ${scalar(entry.name)}`,
    `${indent}  label: ${scalar(entry.label)}`,
    `${indent}  widget: ${entry.widget}`,
    `${indent}  required: true`,
  ]
  if (entry.pattern) {
    lines.push(
      `${indent}  pattern:`,
      `${indent}    - ${scalar(entry.pattern[0])}`,
      `${indent}    - ${scalar(entry.pattern[1])}`,
    )
  }
  if (entry.hint) lines.push(`${indent}  hint: ${scalar(entry.hint)}`)
  return lines
}

type Section = { name: string; label: string; fields: EditableField[] }

const slugOf = (section: string): string =>
  section.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// One collection per section rather than one file entry per section: a files collection
// slugs a loaded entry by the first file entry whose path matches, so N entries over the
// one content file all list as the first. A collection apiece keeps that lookup unique,
// and every file entry keeps the site's name, which is what the preview registers under.
// Decap saves the whole parsed file, so the keys a section does not declare pass through.
function sectionsOf(site: SiteCopy): Section[] {
  const byName = new Map(site.fields.map((entry) => [entry.name, entry]))
  const sections = groupFieldsBySection(site.fields).map(({ section, fields }) => ({
    name: slugOf(section),
    label: section,
    fields: fields.map(({ name }) => byName.get(name)!),
  }))
  if (sections.length === 1) return [{ ...sections[0]!, name: site.collectionName, label: site.collectionLabel }]

  const seen = new Map<string, string>()
  for (const { name, label } of sections) {
    if (!name) throw new Error(`section has no letters or digits to name its collection by: ${label}`)
    if (seen.has(name)) throw new Error(`sections ${seen.get(name)} and ${label} both name the collection ${name}`)
    seen.set(name, label)
  }
  return sections
}

export function adminConfigYaml(site: SiteCopy): string {
  return [
    'backend:',
    '  name: gitea',
    `  base_url: ${scalar(site.forge)}`,
    `  api_root: ${scalar(site.forge)}/api/v1`,
    `  repo: ${scalar(site.contentRepo)}`,
    `  branch: ${scalar(site.contentBranch)}`,
    `  app_id: ${scalar(site.oauthAppId)}`,
    `locale: ${scalar(site.panelLocale)}`,
    `site_url: ${scalar(site.siteUrl)}`,
    `media_folder: ${scalar(site.mediaFolder)}`,
    'collections:',
    ...sectionsOf(site).flatMap((section) => [
      `  - name: ${scalar(section.name)}`,
      `    label: ${scalar(section.label)}`,
      `    description: ${scalar(site.collectionDescription)}`,
      '    files:',
      `      - name: ${scalar(site.contentFileName)}`,
      `        label: ${scalar(site.fileLabel)}`,
      `        file: ${scalar(contentFileOf(site))}`,
      '        fields:',
      ...section.fields.flatMap((entry) => field(entry, '          ')),
    ]),
    '',
  ]
    .join('\n')
}

// lang lands inside an attribute, so the quotes matter as much as the brackets
const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

// Generated rather than shipped static, because the title and the language are the
// client's and the script names are the package's — and plain HTML can template neither.
export function adminShellHtml(site: SiteCopy): string {
  return `<!doctype html>
<html lang="${escapeHtml(site.lang)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${escapeHtml(site.title)}</title>
  </head>
  <body>
    <script src="${DECAP_SCRIPT}"></script>
    <script>
      window.SELF_SERVE_COPY_FILE = ${JSON.stringify(site.contentFileName)}
    </script>
    <script type="module" src="preview.js"></script>
  </body>
</html>
`
}
