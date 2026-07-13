import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        allowDefaultProject: ['src/preload/index.d.ts'],
      },
    },
  },
  {
    files: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    ignores: ['out/**', 'dist/**', 'node_modules/**'],
  },
)
