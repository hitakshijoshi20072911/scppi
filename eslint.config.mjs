import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', 'server/src/lenis/**', 'apps/web/.next/**'] },
  {
    files: ['server/src/**/*.ts', 'server/tests/**/*.ts', 'packages/shared/src/**/*.ts', 'apps/web/**/*.ts', 'apps/web/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
    },
  },
]
