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
]
