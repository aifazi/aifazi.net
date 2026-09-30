import { defineConfig } from 'eslint/config'
import expoConfig from 'eslint-config-expo/flat.js'

export default defineConfig([
  {
    ignores: ['build/', '.expo/', 'node_modules/**', 'dist/', 'android/**', 'ios/**', 'expo-env.d.ts'],
  },
  ...expoConfig,
  {
    // Node scripts (route typegen etc.) run outside the RN runtime —
    // expo config only declares browser/RN globals.
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        console: 'readonly',
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
      },
    },
  },
])