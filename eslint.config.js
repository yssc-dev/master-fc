import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  {
    ignores: [
      'dist',
      'node_modules',
      'test-results',
      'apps-script', // Google Apps Script 런타임 전역(SpreadsheetApp 등) — 별도 환경
      'migration-script.js', // Apps Script 일회성 마이그레이션 사본
      'design_handoff_monochrome_canvas 2',
      'footsal_prompts',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // 기존 코드 톤에 맞춘 완화 — 오류(no-undef 등)는 그대로 잡고 스타일성은 warn
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      // react-hooks v7 컴파일러 진단 — 기존 코드 전반의 패턴이라 점진 정리 대상 (에러로 두면 CI 차단)
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
];
