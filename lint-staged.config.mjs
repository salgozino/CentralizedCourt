export default {
  'backend/**/*.ts': ['prettier --check', 'eslint --max-warnings 0 --no-warn-ignored'],
  'contract-tests/**/*.ts': ['prettier --check', 'eslint --max-warnings 0 --no-warn-ignored'],
  // oxlint runs inside frontend/ so its .oxlintrc.json applies; absolute paths are passed through.
  'frontend/**/*.{ts,tsx}': [
    'prettier --check',
    (files) => `yarn --cwd frontend oxlint --deny-warnings ${files.join(' ')}`,
  ],
  '*.{json,yml,yaml}': 'prettier --check',
};
