import eslint from '@eslint/js';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const tsFiles = ['backend/{src,test}/**/*.ts', 'contract-tests/{src,tests}/**/*.ts'];

export default tseslint.config(
  {
    // dist and dependencies are build/vendor output; frontend is linted by oxlint.
    ignores: ['**/dist/**', '**/node_modules/**', '**/.yarn/**', '**/coverage/**', 'frontend/**'],
  },
  {
    files: tsFiles,
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended, prettierRecommended],
    plugins: { import: importPlugin },
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: {
        // One tsconfig per package; backend needs its own because tsconfig.json only includes src.
        project: ['backend/tsconfig.eslint.json', 'contract-tests/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unused-expressions': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
        // allowDouble: the jest global in contract-tests is declared as __CONTRACT_BACKEND__.
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allowDouble',
          trailingUnderscore: 'allowDouble',
        },
        { selector: 'function', format: ['camelCase', 'PascalCase'] },
        { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['PascalCase', 'UPPER_CASE'] },
        // Object keys and class members often mirror wire formats and DB columns (snake_case, headers).
        { selector: ['objectLiteralProperty', 'typeProperty', 'classProperty', 'classMethod'], format: null },
        { selector: 'import', format: null },
      ],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          pathGroups: [
            { pattern: 'src/**', group: 'internal' },
            { pattern: 'test/**', group: 'internal' },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'max-len': [
        'error',
        { code: 120, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreRegExpLiterals: true },
      ],
    },
  },
  {
    // Jest configs are CommonJS and not part of any tsconfig.
    files: ['**/jest.config.js'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
    extends: [eslint.configs.recommended, prettierRecommended],
  },
);
