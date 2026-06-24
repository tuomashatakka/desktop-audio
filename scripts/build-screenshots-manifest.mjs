#!/usr/bin/env node
import { readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'screenshots');
const out = join(root, 'public', 'screenshots.json');

const exts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

const captions = {
  'library-view': { caption: 'Library — Folder navigation & track list', alt: 'Library view showing folder tree and track list', order: 0 },
  'player-view':  { caption: 'Now Playing — Album art & waveform',       alt: 'Now playing view with album art and waveform', order: 1 },
  'settings-view':{ caption: 'Settings — Theme & playback options',      alt: 'Settings view with theme and playback options', order: 2 },
};

const titleCase = (s) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();

const files = readdirSync(dir)
  .filter((f) => exts.has(parse(f).ext.toLowerCase()))
  .sort();

const items = files.map((file, i) => {
  const { name } = parse(file);
  const meta = captions[name];
  if (meta) {
    return { src: `screenshots/${file}`, alt: meta.alt, caption: meta.caption, order: meta.order };
  }
  const isTimestamped = /^Screenshot\b/i.test(name);
  return {
    src: `screenshots/${file}`,
    alt: isTimestamped ? 'Live application capture' : titleCase(name),
    caption: isTimestamped ? 'Live capture' : titleCase(name),
    order: 100 + i,
  };
});

items.sort((a, b) => a.order - b.order);
items.forEach((it) => delete it.order);

writeFileSync(out, JSON.stringify(items, null, 2) + '\n');
console.log(`Wrote ${items.length} entries → ${out}`);
