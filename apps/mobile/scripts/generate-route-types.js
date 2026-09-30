#!/usr/bin/env node
/**
 * scripts/generate-route-types.js — regenerate .expo/types/router.d.ts.
 *
 * Expo normally writes these while Metro runs (`expo start`), but the file
 * is gitignored, so a fresh checkout (and CI) has no route types: the Href
 * union collapses to `string` and `tsc` stops checking router.push targets.
 * Run this before `npm run typecheck`.
 *
 * Uses the same @expo/cli routine Metro calls, without starting a server.
 */
const path = require('path')

async function main() {
  const root = path.resolve(__dirname, '..')
  const routes = require('@expo/cli/build/src/start/server/type-generation/routes.js')
  await routes.setupTypedRoutes({
    typesDirectory: path.join(root, '.expo', 'types'),
    projectRoot: root,
    routerDirectory: path.join(root, 'app'),
  })
  console.log('route types -> .expo/types/router.d.ts')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
