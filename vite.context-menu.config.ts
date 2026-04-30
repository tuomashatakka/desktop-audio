import { defineConfig } from 'vite'
import path from 'node:path'


export default defineConfig(async () => {
  const react = (await import('@vitejs/plugin-react')).default
  return {
    root:    path.resolve(__dirname, 'src/app/context-menu'),
    plugins: [ react() ],
  }
})
