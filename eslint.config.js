import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // Context files legitimately co-locate Provider components with their
  // consumer hooks (useScenario / useSimulation) and module-level constants
  // (defaultScenario, SPEED_PRESETS). The fast-refresh rule penalizes that
  // pattern; trading the fast-refresh edge case for not splitting every
  // context across two files is the right trade.
  {
    files: ['src/context/*Context.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
