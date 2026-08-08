#!/usr/bin/env node
// Generates platform icon files from assets/icon.svg
// Run: bun scripts/generate-icon.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const __dirname  = dirname(fileURLToPath(import.meta.url))
const root       = resolve(__dirname, '..')
const assetsPath = resolve(root, 'assets')

const svgPath    = resolve(assetsPath, 'icon.svg')
const svg        = readFileSync(svgPath)

const sizes      = [ 16, 32, 48, 64, 128, 256, 512, 1024 ]

mkdirSync(assetsPath, { recursive: true })

// Render each size and collect for ICO/ICNS
const pngBuffers = {}

for (const size of sizes) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
  })
  const rendered = resvg.render()
  const png = rendered.asPng()
  pngBuffers[size] = png
  writeFileSync(resolve(assetsPath, `icon-${size}.png`), png)
}

// Write the primary 1024×1024 as icon.png (used by Linux and Electron packager)
writeFileSync(resolve(assetsPath, 'icon.png'), pngBuffers[1024])

console.log('Generated assets/icon.png and assets/icon-{size}.png for all sizes.')
console.log('For macOS (.icns) and Windows (.ico), run:')
console.log('  macOS: iconutil -c icns assets/icon.iconset')
console.log('  Windows: use png2ico or electron-icon-maker')
