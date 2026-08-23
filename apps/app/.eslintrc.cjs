module.exports = {
  root: true,
  env: { es2022: true, node: true },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  ignorePatterns: ['node_modules', '.expo', 'dist', '.eslintrc.cjs', 'babel.config.js'],
  rules: {
    'no-console': ['error', { allow: ['warn', 'error'] }],
  },
};
