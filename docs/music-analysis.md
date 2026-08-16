# background chord and beat analysis

## runtime flow

1. both player mounts call `useTrackAnalysis(currentTrack.id)`; its module-level
   result and in-flight maps collapse them to one request.
2. `IpcDataSource.analyzeTrack` resolves the track id to its filesystem path and
   invokes `library:analysis` through the preload bridge.
3. `main.ts` routes the request to the singleton `analysis-worker`. the worker
   runs requests sequentially so rapidly skipping tracks cannot launch several
   cpu-heavy analyzers at once.
4. the worker compares the audio file's current `mtime` with
   `track_analysis.source_mtime_ms`. a matching version is returned from sqlite;
   a miss launches `resources/resolve-harmony.py` asynchronously.
5. the python adapter uses the chord, key, section and steady beat-grid resolver
   from `../audio-processing-tools/analyzer`, but skips its unused predominant
   melody stage. the worker commits the compact result before replying.

the analyzer environment is resolved from the sibling
`audio-processing-tools/.venv` checkout (falling back to
`~/Documents/Projects/audio-processing-tools`). packaged builds include the
small adapter, but the analyzer checkout and its essentia/musicpy virtual
environment must exist on the machine.

## storage

`analysis-schema.ts` owns the versioned `track_analysis` table. results are
separate from `tracks`, so library hydration never streams every beat and chord
for every song. the cache key is the track id plus source mtime and analyzer
version. a sqlite delete trigger removes analysis when its track is deleted.

## renderer behavior

- the frequency view shows the current chord, next chord, main key, tempo, and a
  horizontally scrollable ordered list containing every resolved chord region.
- the full now-playing waveform gets ordinary beat and accented downbeat paths.
  the footer player receives no marker data or marker nodes.
- loading, unavailable and error states remain visible in the frequency view.
- artwork-backed player backgrounds fade in on each track-keyed mount; the
  page-wide ambient palette continues to interpolate registered color properties.
- reduced-motion preferences disable the background animation.

## verification

run `bun run typecheck`, `bun run lint`, `bun run test`, and
`bun run package`. for a live analyzer smoke test, play a library track, open
now playing, choose the frequency view, wait for the harmony status to resolve,
then reopen the same track and confirm the result returns immediately from the
sqlite cache.
