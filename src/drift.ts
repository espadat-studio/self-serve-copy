import { hasPath, readPath } from './path-address'
import type { EditableField, SiteCopy } from './site'

type Drift = NonNullable<SiteCopy['drift']>

const PROVENANCE = '<sub>Rewritten in place by `content-sync.yml`. Nothing here fails a build.</sub>'

// spelled out from the site's own list rather than read off a runtime the drift step
// never loads: a sixth locale is added there, by hand
const nameLocales = (locales: readonly string[]): string =>
  locales.map((locale) => `\`${locale}\``)
    .join(', ')
    .replace(/, (?=[^,]*$)/, ' and ')

// The translations were written against the base-locale value, so that value is the
// fingerprint — a plain !== answers "has it moved since", and the baseline diff stays
// legible to whoever has to re-translate it. A key the baseline never recorded reads as
// drifted, which is how a newly fenced key gets asked about once.
export function detectDrift(
  fields: readonly EditableField[],
  targetJson: string,
  baselineJson: string,
): string[] {
  const target = JSON.parse(targetJson) as Record<string, unknown>
  const baseline = JSON.parse(baselineJson) as Record<string, unknown>

  return fields.filter((field) => baseline[field.name] !== readPath(target, field.name))
    .map((field) => field.name)
}

// the inverse of detectDrift, and the only thing that clears a key: it records the base
// locale the named keys were just translated from. recording a key nobody re-translated
// would clear it from the report for good, so the caller names them one by one.
export function recordBaseline(
  fields: readonly EditableField[],
  targetJson: string,
  baselineJson: string,
  names: string[],
): string {
  const target = JSON.parse(targetJson) as Record<string, unknown>
  const baseline = JSON.parse(baselineJson) as Record<string, unknown>
  const fence = new Set(fields.map((field) => field.name))

  const unfenced = names.filter((name) => !fence.has(name))
  if (unfenced.length > 0)
    throw new Error(`not fenced keys, so no translation waits on them: ${unfenced.join(', ')}`)

  const absent = names.filter((name) => !hasPath(target, name))
  if (absent.length > 0)
    throw new Error(`the target file carries nothing to record for: ${absent.join(', ')}`)

  const recorded: Record<string, unknown> = { ...baseline }
  for (const name of names) recorded[name] = readPath(target, name)

  // written in fence order rather than the order the keys were named, so the diff shows
  // only the values that moved
  const ordered = fields.filter((field) => field.name in recorded)
    .map((field) => [field.name, recorded[field.name]])

  return `${JSON.stringify(Object.fromEntries(ordered), null, 2)}\n`
}

export function renderDriftReport(
  fields: readonly EditableField[],
  stale: string[],
  drift: Drift,
): string {
  const locales = nameLocales(drift.locales)

  if (stale.length === 0) {
    return [
      `Every fenced key's base copy still reads as it did when ${locales} were written against it. Nothing to refresh.`,
      '',
      PROVENANCE,
    ]
      .join('\n')
  }

  const drifted = fields.filter((field) => stale.includes(field.name))

  return [
    `The base copy of these keys has moved since ${locales} were written against it, so those now say the old thing:`,
    '',
    ...drifted.map((field) => `- \`${field.name}\` — ${field.label}`),
    '',
    'Re-translate one, then record the base copy you translated from:'
    + ` \`${drift.refreshCommand}\`.`
    + ' It clears only the keys you name. Commit the translations and the baseline together.',
    '',
    PROVENANCE,
  ]
    .join('\n')
}
