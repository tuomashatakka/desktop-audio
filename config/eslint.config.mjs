import path from 'node:path'
import config from '@tuomashatakka/eslint-config'


/** This file lives in config/, so the tsconfig root climbs one level. */
const projectRoot = path.resolve(import.meta.dirname, '..')

export default [
  { ignores: [ '.vite/**', 'dist/**', 'coverage/**', 'src/app/index.js' ]},

  ...config,

  // Type-aware linting needs the project's tsconfig; the shared config leaves
  // this to the consumer because it cannot know where the tsconfig lives.
  {
    files:           [ 'src/**/*.{ts,tsx}' ],
    languageOptions: { parserOptions: { project: true, tsconfigRootDir: projectRoot }},
  },
]
