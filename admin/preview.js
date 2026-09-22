import { groupFieldsBySection } from './section-grouping.js'

const h = window.h

function field(item, value) {
  if (!value) return null
  return h(
    'p',
    { key: item.name, className: 'field' },
    h('span', { className: 'field-label' }, item.label),
    h('span', { className: 'field-value' }, value),
  )
}

function section(group, data) {
  return h(
    'section',
    { key: group.section, className: 'section' },
    h('h2', null, group.section),
    group.fields.map((item) => field(item, data.get(item.name))),
  )
}

// Decap passes its own field configs as an Immutable list; the plain shape is
// what section-grouping reads, so the Immutable knowledge stops here.
function plainFields(fields) {
  return fields
    .toArray()
    .map((entry) => ({ name: entry.get('name'), label: entry.get('label') || entry.get('name') }))
}

function CopyPreview({ entry, fields }) {
  const data = entry.get('data')
  const groups = groupFieldsBySection(plainFields(fields))
  return h(
    'div',
    { className: 'preview' },
    groups.map((group) => section(group, data)),
  )
}

// A files collection keys its preview template by the file's name, not the
// collection's — `templateName(_collection, slug)` returns the slug, and the
// slug of a file entry is that file's name. Registered under the collection
// name the template is never found and Decap silently renders its own default
// pane, which is the failure this reads as. The name is the one site-specific
// thing here, so the generated shell declares it rather than this file.
window.CMS.registerPreviewStyle('preview.css')
window.CMS.registerPreviewTemplate(window.SELF_SERVE_COPY_FILE, CopyPreview)
