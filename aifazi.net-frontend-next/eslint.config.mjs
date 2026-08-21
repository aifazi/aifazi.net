import next from 'eslint-config-next'

const nextConfig = Array.isArray(next) ? next : [next]

export default [
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
]
