// A field's name is a dotted path into the target file. A flat content model is the
// depth-1 case: `seo_title` is a one-segment walk that lands on a top-level key.
// Array positions are literal segments, so list contents are editable and list shape
// is not.
export type EditableField = {
  name: string
  label: string
  widget: 'string' | 'text'
  hint?: string
  pattern?: readonly [string, string]
}

// What a consuming site supplies. Everything here is site-specific by construction;
// the fence — `fields` — most of all.
export type SiteCopy = {
  title: string
  lang: string
  forge: string
  contentRepo: string
  contentBranch: string
  // Also the name Decap resolves the preview template by: a files collection keys the
  // template on the file's name, not the collection's.
  contentFileName: string
  oauthAppId: string
  panelLocale: string
  siteUrl: string
  mediaFolder: string
  collectionName: string
  collectionLabel: string
  collectionDescription: string
  fileLabel: string
  // Relative to the directory the CLI runs in.
  targetFile: string
  statusContext: string
  statusDescription: string
  fields: readonly EditableField[]
  // Omitted by a monolingual site, which then never calls the drift subcommand.
  drift?: {
    baselineFile: string
    locales: readonly string[]
    refreshCommand: string
  }
}

export const contentFileOf = (site: SiteCopy): string => `${site.contentFileName}.json`

export const forgeApiOf = (site: SiteCopy): string => `${site.forge}/api/v1/repos/${site.contentRepo}`
