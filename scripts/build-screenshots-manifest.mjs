#!/usr/bin/env node
/**
 * Builds the landing page's screenshot gallery.
 *
 * Screenshots are authored in `assets/screenshots/` — beside the icons, with
 * the rest of the project's source artwork — but the Pages artifact is the
 * `public/` directory alone, so nothing outside it is reachable from the
 * deployed site. This copies them in as well as writing the manifest, in one
 * step, so a local preview and a CI deploy see exactly the same gallery.
 *
 * `public/screenshots/` is therefore generated output and is gitignored — the
 * images live in exactly one place in the repository.
 *
 * Two manifests are written from the one list. `screenshots.mjs` is what the
 * page actually loads (a plain script assigning `window.screenshots`, so the
 * gallery needs no fetch and works from `file://`); `screenshots.json` is the
 * same data for anything that would rather read it over HTTP. They were hand-
 * maintained duplicates before, which is precisely how one of them went stale.
 */
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'assets', 'screenshots');
const dest = join(root, 'public', 'screenshots');
const outJson = join(root, 'public', 'screenshots.json');
const outMjs = join(root, 'public', 'screenshots.mjs');

const exts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

/**
 * Captions, in gallery order. Anything not listed here still ships — it just
 * falls to the end with a title-cased name, so dropping a new capture into
 * `assets/screenshots/` is enough to publish it.
 */
const captions = {
  'now-playing-harmony': {
    caption: 'Now Playing — The analysis view: chords, key & tempo',
    alt: 'Now playing in the analysis view, with the chord lane, key and tempo over the frequency mesh',
    order: 0,
  },
  'now-playing-lyrics': {
    caption: 'Now Playing — Lyrics laid over the spectrum',
    alt: 'Lyrics scrolling down the right edge over the frequency mesh',
    order: 1,
  },
  'dsp-chain': {
    caption: 'DSP — 16-band EQ, compressor & limiter',
    alt: 'Audio processing page with sixteen EQ faders, compressor knobs and a limiter',
    order: 2,
  },
  'now-playing-artwork-lyrics': {
    caption: 'Now Playing — Artwork, waveform & lyrics',
    alt: 'Now playing view with album art, waveform seek bar and the lyrics layer',
    order: 3,
  },
  'now-playing-lyrics-light': {
    caption: 'Themes — The palette is derived from the cover',
    alt: 'The same view under a light theme derived from the album artwork',
    order: 4,
  },
  'now-playing-lyrics-compact': {
    caption: 'Now Playing — Narrow window: the cover becomes a banner',
    alt: 'Now playing in a narrow window, the album art filling the top and dissolving behind the title',
    order: 5,
  },
  'now-playing-harmony-derived': {
    caption: 'Themes — Accent follows the artwork, chrome stays dark',
    alt: 'Now playing view with a lime accent derived from the album artwork',
    order: 6,
  },
  'mini-player-themed': {
    caption: 'Mini player — The same bar under a custom palette',
    alt: 'Compact player bar with album art, transport controls and a waveform, under a custom colour theme',
    order: 7,
  },
  'library-breadcrumbs': {
    caption: 'Library — Breadcrumb navigation & hamburger toggle',
    alt: 'Library view with clickable breadcrumb navigation',
    order: 10,
  },
  'library-sticky-header': {
    caption: 'Library — Header collapses on scroll, columns stay pinned',
    alt: 'Library scrolled down, column header pinned to the top',
    order: 11,
  },
  'library-album-groups': {
    caption: 'Library — Grouped by album',
    alt: 'Library grouped by album with cover art beside each group',
    order: 12,
  },
  'mini-player-landscape': {
    caption: 'Mini player — Landscape: art, controls & waveform',
    alt: 'Mini player in a short wide window with art, controls and waveform side by side',
    order: 20,
  },
  'mini-player-portrait': {
    caption: 'Mini player — Portrait: full stack in a narrow window',
    alt: 'Mini player in a tall narrow window with the full stacked layout',
    order: 21,
  },
  'mini-player-compact': {
    caption: 'Mini player — Compact: controls stack under the title',
    alt: 'Mini player with the controls stacked under the title and waveform',
    order: 22,
  },
  'mini-player-wide': {
    caption: 'Mini player — Slim bar with hairline progress',
    alt: 'Mini player as a slim bar with title, next button and a hairline progress line',
    order: 23,
  },
};

const titleCase = (s) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();

const files = readdirSync(source)
  .filter((f) => exts.has(parse(f).ext.toLowerCase()))
  .sort();

const items = files.map((file, i) => {
  const { name } = parse(file);
  const meta = captions[name];
  if (meta) {
    return { src: `screenshots/${file}`, alt: meta.alt, caption: meta.caption, order: meta.order };
  }
  return {
    src: `screenshots/${file}`,
    alt: `${titleCase(name)} — captured from the running application`,
    caption: titleCase(name),
    order: 100 + i,
  };
});

items.sort((a, b) => a.order - b.order);
items.forEach((it) => delete it.order);

// Rebuilt from scratch every run: a capture deleted from `assets/` has to
// disappear from the site too, and a stale copy here would outlive it.
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(source, dest, { recursive: true, filter: (src) => !src.endsWith('.DS_Store') });

const json = JSON.stringify(items, null, 2);

writeFileSync(outJson, json + '\n');
writeFileSync(outMjs, `const screenshots = ${json}\n\nwindow.screenshots = screenshots\n`);

console.log(`Copied ${files.length} screenshots → ${dest}`);
console.log(`Wrote ${items.length} entries → ${outJson} and ${outMjs}`);
