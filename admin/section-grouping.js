/**
 * @typedef {{ name: string, label: string }} Field
 * @typedef {{ section: string, fields: Field[] }} Section
 */

const SEPARATOR = ' · '

export const UNGROUPED = 'Otros'

/**
 * @param {readonly Field[]} fields
 * @returns {Section[]}
 */
export function groupFieldsBySection(fields) {
  const sections = []
  const bySection = new Map()

  for (const { name, label } of fields) {
    const separator = label.indexOf(SEPARATOR)
    const section = separator === -1 ? UNGROUPED : label.slice(0, separator)
    const fieldLabel = separator === -1 ? label : label.slice(separator + SEPARATOR.length)

    if (!bySection.has(section)) {
      bySection.set(section, { section, fields: [] })
      sections.push(bySection.get(section))
    }
    bySection.get(section).fields.push({ name, label: fieldLabel })
  }

  return sections
}
