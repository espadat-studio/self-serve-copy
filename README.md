# @espadat/self-serve-copy

The site-agnostic half of the self-serve copy path: a client edits the words on a static site through a Decap panel, publishing to a content repository on a forge, and a scheduled workflow carries the edit back into the site's own repository behind a fence.

Consumed by git tag, like the studio's other shared package:

```jsonc
// package.json
"dependencies": {
  "@espadat/self-serve-copy": "github:espadat-studio/self-serve-copy#v0.1.0"
}
```

No build step. `exports` point at raw TypeScript, compiled by the consumer.

## What is here and what is not

| Here | Yours |
| --- | --- |
| Admin shell, preview renderer, styles, section grouping | The field list — the fence, by construction |
| `EditableField`, the config generator, the path-aware merge | Backend values: content repo, OAuth client id, panel locale, site URL, media folder |
| The drift detector | The target file, and whether the drift command runs at all |
| The bridge: forge fetch, encoding and status checks, retry semantics, status payloads | A workflow of roughly 30 lines: schedule, concurrency, permissions, checkout, app token, push |

The fence is the boundary, not the mechanism. Nothing about one site's editable-key list generalises to another, so it never lives here.

## The site module

One default-exported `SiteCopy`. The CLI imports it by path, so it is typed and a bad widget is a compile error in the site that owns it.

```ts
import type { SiteCopy } from '@espadat/self-serve-copy/site'
import { EDITABLE_FIELDS } from './editable-keys'

export default {
  title: 'Textos de la web · M.A. Instalaciones',
  lang: 'es',
  forge: 'https://git.example.xyz',
  contentRepo: 'owner/site-content',
  contentBranch: 'master',
  contentFileName: 'es',
  oauthAppId: '…',
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
  fields: EDITABLE_FIELDS,
  drift: {
    baselineFile: 'messages/translation-baseline.json',
    locales: ['ca', 'de', 'en', 'fr'],
    refreshCommand: 'mise r translation-baseline -- <key>',
  },
} satisfies SiteCopy
```

A monolingual site omits `drift` and never calls the drift command. No flag, no dead branch.

## A field's name is a path

`seo_title` addresses a top-level key. `accueil.hero.titre` addresses a leaf three deep. `parcours.1.annee` addresses a position in an array. The Decap form is flat either way — the incoming file arrives keyed by the whole path — and only the merge resolves it.

An absent intermediate is an error, never a path to create. Array positions are literal, so list contents are editable and list shape is not: the client edits words, never structure.

## Building the panel

```ts
import {
  ADMIN_ASSETS,
  ADMIN_CONFIG_FILE,
  ADMIN_SHELL_FILE,
  adminAssetPath,
  adminConfigYaml,
  adminShellHtml,
  DECAP_SCRIPT,
  decapDistPath,
} from '@espadat/self-serve-copy/admin-config'

const admin = new URL('admin/', config.publicDir)
mkdirSync(admin, { recursive: true })
copyFileSync(decapDistPath(), new URL(DECAP_SCRIPT, admin))
for (const name of ADMIN_ASSETS) copyFileSync(adminAssetPath(name), new URL(name, admin))
writeFileSync(new URL(ADMIN_CONFIG_FILE, admin), adminConfigYaml(site))
writeFileSync(new URL(ADMIN_SHELL_FILE, admin), adminShellHtml(site))
```

Every file under `public/admin/` is generated. Gitignore the directory and keep the 5MB Decap bundle out of the tree.

## The CLI

```
self-serve-copy fetch  --config <module> --out <file>   read the client's copy off the forge
self-serve-copy merge  --config <module> <incoming>     apply it to the target file, fence first
self-serve-copy status --config <module> --sha <commit> mark the client's commit as publishing
self-serve-copy drift  --config <module> --out <file>   report the locales whose base copy has moved
```

`fetch` and `status` read `FORGEJO_TOKEN`. `fetch` appends `fetched` and `sha` to `$GITHUB_OUTPUT`, so the caller's later steps gate on `steps.<id>.outputs.fetched` with no shell of their own.

A forge that is unreachable, rate-limited or 5xx leaves `fetched` unset and exits 0: the poll is the retry, and the next tick picks the edit up. Anything else — a redirect, an auth failure, a missing file — is a misconfiguration and fails loudly.

## What the consumer still has to set up

`~/code/auberge/examples/forgejo-onboard.sh` does the forge side: it creates the private content repository and registers the OAuth application with one redirect URI per site origin, is idempotent, and records why `confidential_client` must be false. It does not cover GitHub, where the consuming repository needs:

| Secret | Used by |
| --- | --- |
| `FORGEJO_TOKEN` | `fetch` and `status` |
| `APP_ID`, `APP_PRIVATE_KEY` | the app token the bridge pushes with |

## Renovate

Four conditions keep the pin current, each silent if broken:

- the tag is version-shaped — a branch ref gets `skipReason: unversioned-reference` and is never updated
- this repository stays public
- the consumer has the `npm` manager enabled
- a `packageRule` retypes the bump, or the default typing cuts a site release for a copy-tooling change

## Tests

```
bun test
```
