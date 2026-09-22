import type { SiteCopy } from './site'

// One complete site, so a test needing a whole SiteCopy spreads this rather than casting
// a partial one past the checker.
export const EXAMPLE_SITE: SiteCopy = {
  title: 'Textos de la web · Example',
  lang: 'es',
  forge: 'https://git.example.xyz',
  contentRepo: 'owner/content',
  contentBranch: 'master',
  contentFileName: 'es',
  oauthAppId: 'f510ab8a-3682-4bd5-9be1-949c7fdbb4c5',
  panelLocale: 'es',
  siteUrl: 'https://example.com',
  mediaFolder: 'img',
  collectionName: 'textos',
  collectionLabel: 'Textos de la web',
  collectionDescription: 'Al publicar, el cambio tarda unos diez minutos.',
  fileLabel: 'Textos en español',
  targetFile: 'messages/es.json',
  statusContext: 'deploy/example.com',
  statusDescription: 'Publicando el cambio.',
  fields: [
    { name: 'seo_title', label: 'Buscadores · Título', widget: 'string' },
    { name: 'about_body_1', label: 'Sobre mí · Primero', widget: 'text', pattern: ['.*\\{years\\}.*', 'Deja {years}'] },
    { name: 'hero_image_alt', label: 'Portada · Foto', widget: 'string', hint: 'La leen los buscadores.' },
  ],
  drift: {
    baselineFile: 'messages/translation-baseline.json',
    locales: ['ca', 'de', 'en', 'fr'],
    refreshCommand: 'mise r translation-baseline -- <key>',
  },
}
