# background chord and beat analysis

## runtime flow

1. both player mounts call `useTrackAnalysis(currentTrack)`; its module-level
   result and in-flight maps collapse them to one request. it takes the whole
   track, not just the id, because the progress estimate needs the duration.
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

## priority and preemption

the renderer only ever asks about the track it is showing, so the newest request
*is* the current track. `drain()` therefore takes from the **end** of the
backlog, and a newly arrived request `kill()`s the resolver still running for a
track the listener has already left — one file can hold the single-threaded
resolver for minutes, so priority has to mean preemption. preempted requests are
not requeued; the renderer asks again if it still needs one. the backlog is
trimmed to `QUEUE_LIMIT` (8), and anything past that is answered with
`superseded by newer tracks`.

## failures

the resolver prints its refusal as `{"error": …}` on **stdout** and *still*
exits non-zero. a promisified `execFile` rejects on the exit code and discards
that output, which is why failures used to surface as `Command failed:` followed
by the whole command line. `spawnResolver` reads stdout on failure too and
prefers it whenever it is there; `humanize()` puts a readable sentence in front
of the decoder's own words.

the common refusal is a file whose audio no decoder here can open. ableton's
`.aif` samples are the usual source: an `able` codec inside an aiff-c wrapper
that neither ffmpeg (essentia's loader) nor macos coreaudio decodes — `afinfo`
fails on them too. nothing in this repo can make those analysable.

refusals are cached in `result_json` as `{"error": …}` and read back as a
discriminated `CachedOutcome`, because the same file will refuse identically
until it changes. transient failures — a missing interpreter, a timeout, a
preemption — are never written down.

## storage

`analysis-schema.ts` owns the versioned `track_analysis` table. results are
separate from `tracks`, so library hydration never streams every beat and chord
for every song. the cache key is the track id plus source mtime and analyzer
version. a sqlite delete trigger removes analysis when its track is deleted. a
row holds either a result or the reason there will never be one.

## renderer behavior

- the **analysis view** — one of the two now-playing views — shows key, tempo
  and a moving chord ribbon under the track title, over the frequency mesh. see
  `AnalysisReadout` and the CLAUDE.md section it is documented in.
- the full now-playing waveform gets ordinary beat and accented downbeat paths.
  the footer player receives no marker data or marker nodes.
- while an analysis runs, a native `<progress>` shows a bar against a learned
  estimate, or the platform's indeterminate sweep when there is nothing to
  estimate from yet. the rate is `engine.analysisSeconds / duration`, folded
  into a running average as results arrive — the resolver emits nothing until it
  is finished, so an estimate is the only honest progress available.
- failures are shown, never swallowed: the readout states the reason in place of
  the result. `main.ts` logs a refusal at `info` and everything else at `warn`,
  so a library full of undecodable samples does not fill the log with stack
  traces.
- artwork-backed player backgrounds fade in on each track-keyed mount; the
  page-wide ambient palette continues to interpolate registered color properties.
- reduced-motion preferences disable the background animation, and the chord
  ribbon's interpolation loop does not start at all.

## verification

run `bun run typecheck`, `bun run lint`, `bun run test`, and
`bun run package`. for a live analyzer smoke test, play a library track, open
now playing, choose the analysis view, watch the progress bar resolve, then
reopen the same track and confirm the result returns immediately from the sqlite
cache. for the failure path, play any `.aif` from an ableton factory pack and
confirm the readout names the reason instead of spinning.
