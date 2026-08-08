import { defineConfig } from 'vite'
import path from 'node:path'


/** This file lives in config/vite/, so repo-relative paths climb two levels. */
const projectRoot = path.resolve(__dirname, '..', '..')


export default defineConfig(async () => {
  const react = (await import('@vitejs/plugin-react')).default
  return {
    root: path.resolve(projectRoot, 'src/app/context-menu'),

    build: {
      // Forge injects a *relative* outDir ('.vite/renderer/context_menu_window'),
      // which Vite resolves against `root` — i.e. into src/app/context-menu/.
      // main.ts loads ../renderer/<name>/index.html from the project root, so
      // pin the absolute path here or the packaged window 404s.
      outDir:      path.resolve(projectRoot, '.vite/renderer/context_menu_window'),
      emptyOutDir: true,
    },

    plugins: [ react() ],
  }
})
