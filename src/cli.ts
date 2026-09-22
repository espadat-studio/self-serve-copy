#!/usr/bin/env bun
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { fetchCopy, postStatus } from './bridge'
import { detectDrift, renderDriftReport } from './drift'
import { mergeFenced } from './merge'
import type { SiteCopy } from './site'

const USAGE = `usage: self-serve-copy <command> --config <module>

  fetch  --out <file>       read the client's copy off the forge
  merge  <incoming.json>    apply it to the target file, fence first
  status --sha <commit>     mark the client's commit as publishing
  drift  --out <file>       report the locales whose base copy has moved`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: 'string' },
    out: { type: 'string' },
    sha: { type: 'string' },
  },
})

const [command, ...rest] = positionals

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`${name} is required\n\n${USAGE}`)
  return value
}

const token = (): string => required(process.env.FORGEJO_TOKEN, 'FORGEJO_TOKEN')

// A module rather than a config file: the field list is typed, and a typo in a widget or
// a pattern is a compile error in the site that owns it.
async function loadSite(): Promise<SiteCopy> {
  const path = resolve(required(values.config, '--config'))
  const loaded = await import(pathToFileURL(path).href) as { default?: SiteCopy }
  if (!loaded.default) throw new Error(`${path} has no default export`)
  return loaded.default
}

// The caller's later steps gate on these. Outside Actions there is nowhere to write
// them and nothing reads them, so a missing GITHUB_OUTPUT is a local run, not a fault.
function emitStepOutputs(outputs: Record<string, string>): void {
  const file = process.env.GITHUB_OUTPUT
  if (!file) return
  appendFileSync(file, `${Object.entries(outputs).map(([key, value]) => `${key}=${value}`).join('\n')}\n`)
}

const COMMANDS = ['fetch', 'merge', 'status', 'drift'] as const

type Command = (typeof COMMANDS)[number]

const isCommand = (value: string | undefined): value is Command =>
  COMMANDS.includes(value as Command)

async function main(): Promise<void> {
  // checked before the site loads, so `self-serve-copy typo` says so rather than
  // complaining about a --config it would not have used
  if (!isCommand(command)) throw new Error(`unknown command ${command ?? ''}\n\n${USAGE}`)
  const site = await loadSite()

  switch (command) {
    case 'fetch': {
      const outcome = await fetchCopy(site, token())
      if (!outcome.fetched) {
        console.log(outcome.reason)
        return
      }
      writeFileSync(required(values.out, '--out'), outcome.content)
      emitStepOutputs({ fetched: 'true', sha: outcome.sha })
      return
    }

    case 'merge': {
      const incoming = required(rest[0], 'the incoming file')
      const { merged, dropped } = mergeFenced(
        site.fields,
        readFileSync(site.targetFile, 'utf8'),
        readFileSync(incoming, 'utf8'),
      )
      writeFileSync(site.targetFile, merged)
      console.log(`dropped ${dropped.length} key(s) outside the fence: ${dropped.join(' ')}`)
      return
    }

    case 'status': {
      await postStatus(site, token(), required(values.sha, '--sha'))
      return
    }

    case 'drift': {
      if (!site.drift) throw new Error('this site declares no drift baseline, so it has no locales to report on')
      const stale = detectDrift(
        site.fields,
        readFileSync(site.targetFile, 'utf8'),
        readFileSync(site.drift.baselineFile, 'utf8'),
      )
      writeFileSync(required(values.out, '--out'), `${renderDriftReport(site.fields, stale, site.drift)}\n`)
      // the count is the command's only stdout, so a caller can open and close on it
      console.log(stale.length)
      return
    }
  }
}

await main()
