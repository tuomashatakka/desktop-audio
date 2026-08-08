import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'

/** This file lives in config/vite/, so repo-relative paths climb two levels. */
const projectRoot = path.resolve(__dirname, '..', '..')


/**
 * main.ts resolves the window icon as `<__dirname>/../assets/icon.png`, and
 * __dirname is `.vite/build` both in dev and inside the packaged asar. Only
 * `.vite` is copied into the package, so the icon has to live there too.
 */
function emitWindowIcon () {
  return {
    name: 'desktop-audio:emit-window-icon',

    closeBundle () {
      const source = path.resolve(projectRoot, 'assets/icon.png')
      const target = path.resolve(projectRoot, '.vite/assets/icon.png')

      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(source, target)
    },
  }
}

// https://vitejs.dev/config
export default defineConfig({
  plugins: [ emitWindowIcon() ],

  build: {
    rollupOptions: {
      // better-sqlite3 is a native .node module — must not be bundled
      // mpris-service uses D-Bus bindings that must not be bundled
      external: [ 'better-sqlite3', 'mpris-service' ],
    },
  },
})
