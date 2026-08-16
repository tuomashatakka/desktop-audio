"""Fast chord/key/tempo adapter for the audio-processing-tools backend.

The upstream CLI also extracts a predominant melody, which is its most
expensive stage. desktop-audio only consumes harmony and beat data, so this
adapter calls the same resolver functions without paying for unused melody.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from time import perf_counter
from typing import Any


os.environ.setdefault('PYGAME_HIDE_SUPPORT_PROMPT', '1')


def analyze_harmony(analyzer_root: Path, audio_path: Path) -> dict[str, Any]:
    sys.path.insert(0, str(analyzer_root))

    import essentia.standard as es

    from backend.analyze import (
        HOP_SIZE,
        MAX_BPM,
        MAX_INPUT_SECONDS,
        MIN_BPM,
        SAMPLE_RATE,
        extract_chords,
        extract_rhythm_candidate,
        extract_tonality,
        package_version,
        preload_libatomic,
    )
    from backend.analysis_utils import clamp, finite_float, rounded
    from backend.beat_pipeline import (
        detect_sections,
        estimate_tempo_from_markers,
        find_amplitude_peaks,
        fit_beat_phase,
        resolve_beats,
    )

    preload_libatomic()
    started_at = perf_counter()
    warnings = [
        'chords are beat-synchronous estimates and may simplify extensions, inversions, or fast changes',
    ]
    audio = es.MonoLoader(filename=str(audio_path), sampleRate=SAMPLE_RATE)()

    if len(audio) == 0:
        raise ValueError('the decoded audio file is empty')

    duration = len(audio) / SAMPLE_RATE
    if MAX_INPUT_SECONDS > 0 and duration > MAX_INPUT_SECONDS:
        raise ValueError(
            f'the track is {duration / 60:.1f} minutes long; this analyzer accepts up to '
            f'{MAX_INPUT_SECONDS / 60:.0f} minutes'
        )

    transients = find_amplitude_peaks(audio, SAMPLE_RATE)
    rhythm_bpm, rhythm_confidence = extract_rhythm_candidate(es, audio, warnings)
    tempo, marker_confidence = estimate_tempo_from_markers(
        transients,
        rhythm_bpm,
        MIN_BPM,
        MAX_BPM,
    )
    beat_phase, phase_confidence = fit_beat_phase(transients, tempo)
    tempo_confidence = clamp(
        marker_confidence * 0.6
        + phase_confidence * 0.25
        + rhythm_confidence * 0.15
    )
    tonal = extract_tonality(es, audio, warnings)
    sections = detect_sections(
        audio,
        tonal['hpcp'],
        tempo,
        duration,
        SAMPLE_RATE,
        beat_phase,
        transients,
    )
    beats = resolve_beats(tempo, duration, sections, transients, beat_phase)
    beat_times = [finite_float(beat['time']) for beat in beats]
    chords = extract_chords(
        es,
        tonal['hpcp'],
        beat_times,
        duration,
        tonal['key'],
        warnings,
    )

    return {
        'version': 1,
        'duration': rounded(duration),
        'tempo': {
            'bpm': rounded(tempo, 3),
            'confidence': rounded(tempo_confidence),
        },
        'key': tonal['key'],
        'beats': beats,
        'chords': chords,
        'engine': {
            'audio': f'essentia {package_version("essentia")}',
            'theory': f'musicpy {package_version("musicpy")}',
            'analysisSeconds': rounded(perf_counter() - started_at, 3),
        },
        'warnings': warnings,
    }


def main() -> int:
    if len(sys.argv) != 3:
        print(json.dumps({'error': 'usage: resolve-harmony.py <analyzer-root> <audio-file>'}))
        return 2

    analyzer_root = Path(sys.argv[1]).resolve()
    audio_path = Path(sys.argv[2]).resolve()

    if not (analyzer_root / 'backend' / 'analyze.py').is_file():
        print(json.dumps({'error': 'audio-processing-tools analyzer root does not exist'}))
        return 2
    if not audio_path.is_file():
        print(json.dumps({'error': 'audio file does not exist'}))
        return 2

    try:
        print(json.dumps(
            analyze_harmony(analyzer_root, audio_path),
            allow_nan=False,
            separators=(',', ':'),
        ))
        return 0
    except Exception as error:
        print(json.dumps({'error': str(error)}, allow_nan=False, separators=(',', ':')))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
