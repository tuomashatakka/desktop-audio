import { defineConfig } from 'vite'
import path from 'node:path'


export default defineConfig(async () => {
  const react = (await import('@vitejs/plugin-react')).default
  return {
    root: path.resolve(__dirname, 'src/app/context-menu'),

    build: {
      // Forge injects a *relative* outDir ('.vite/renderer/context_menu_window'),
      // which Vite resolves against `root` — i.e. into src/app/context-menu/.
      // main.ts loads ../renderer/<name>/index.html from the project root, so
      // pin the absolute path here or the packaged window 404s.
      outDir:      path.resolve(__dirname, '.vite/renderer/context_menu_window'),
      emptyOutDir: true,
    },

    plugins: [ react() ],
  }
})
