import { defineConfig } from 'eslint/config'
import expoConfig from 'eslint-config-expo/flat.js'

export default defineConfig([
  {
    ignores: ['build/', '.expo/', 'node_modules/**', 'dist/', 'android/**', 'ios/**', 'expo-env.d.ts'],
  },
  ...expoConfig,
])