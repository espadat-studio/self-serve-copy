// hand-written rather than generated: section-grouping.js is copied into the site's
// public/ and loaded by the browser as it stands, so it cannot be TypeScript
export type Field = { name: string; label: string }
export type Section = { section: string; fields: Field[] }

export declare const UNGROUPED: string
export declare function groupFieldsBySection(fields: readonly Field[]): Section[]
