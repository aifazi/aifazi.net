import next from 'eslint-config-next'

const nextConfig = Array.isArray(next) ? next : [next]

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'node_modules/**',
      'next-env.d.ts',
      '.vercel/**',
    ],
  },
  // jsx-a11y is already included via eslint-config-next (6.10.2) — no extra
  // plugin install needed. Keep a11y as warn via next preset; do not add
  // noisy click-events rules here (would push 142 → 281 warnings past the
  // 150 guard). Revisit once interactive divs get keyboard handlers.
  //
  // no-undef for JSX: the /helpdesk outage was a bare `mono` identifier that
  // passed both tsc (allowJs without checkJs) and eslint. This gates the class.
  {
    files: ['**/*.jsx'],
    rules: {
      'no-undef': 'error',
    },
  },
  // no-page-custom-font flags <link rel="stylesheet"> font loads in pages,
  // where they'd load for a single page only. app/layout.tsx is the root
  // layout — the App Router equivalent of _document — so the fonts load once
  // globally for every route. Moving them to next/font would rename the font
  // families (CSS vars + hundreds of font-family references) and is tracked
  // as a separate performance change.
  {
    files: ['app/layout.tsx'],
    rules: {
      '@next/next/no-page-custom-font': 'off',
    },
  },
]

export default eslintConfig
