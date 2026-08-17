// Metro config — enables importing @fazi/shared (packages/shared) from outside
// the app folder. Standard Expo monorepo recipe: watch the shared package and
// tell the resolver where node_modules live.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const sharedRoot = path.resolve(projectRoot, '..', '..', 'packages', 'shared')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [sharedRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(sharedRoot, 'node_modules'),
]
config.resolver.unstable_enableSymlinks = true

module.exports = config