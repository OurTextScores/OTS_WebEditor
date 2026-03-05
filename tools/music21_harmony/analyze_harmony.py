#!/usr/bin/env python3
import json
import os
import sys
import tempfile
import warnings as py_warnings
from collections import Counter
from typing import Any, Dict, List, Optional


def emit(payload: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


def error_payload(code: str, message: str, details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    body: Dict[str, Any] = {
        "ok": False,
        "error": {
            "code": code,
            "message": message,
        },
    }
    if details:
        body["error"]["details"] = details
    return body


def read_request() -> Dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


def normalize_symbol(value: str) -> str:
    return value.replace("-", "b").strip()


def tonic_symbol(key_obj: Any) -> str:
    tonic_name = normalize_symbol(getattr(getattr(key_obj, "tonic", None), "name", "C"))
    mode = str(getattr(key_obj, "mode", "major") or "major").lower()
    return tonic_name + ("m" if mode == "minor" else "")


def key_name(key_obj: Any) -> Optional[str]:
    if key_obj is None:
        return None
    tonic = normalize_symbol(getattr(getattr(key_obj, "tonic", None), "name", ""))
    mode = str(getattr(key_obj, "mode", "") or "").strip().lower()
    if not tonic or not mode:
        return None
    return f"{tonic} {mode}"


def smooth_measure_keys(keys: List[Any], global_key: Any) -> List[Any]:
    if not keys:
        return []
    result: List[Any] = []
    for index, current in enumerate(keys):
        window = [candidate for candidate in keys[max(0, index - 1):min(len(keys), index + 2)] if candidate is not None]
        if not window:
            result.append(global_key)
            continue
        counts = Counter(key_name(candidate) or "" for candidate in window if candidate is not None)
        best_name = counts.most_common(1)[0][0] if counts else ""
        if best_name:
            chosen = next((candidate for candidate in window if key_name(candidate) == best_name), current)
            result.append(chosen if chosen is not None else global_key)
        else:
            result.append(current if current is not None else global_key)
    return result


def simplify_symbol_for_mma(symbol: str, fallback_symbol: str) -> str:
    normalized = normalize_symbol(symbol)
    if not normalized:
        return fallback_symbol

    root = ""
    if normalized and normalized[0] in "ABCDEFG":
        root = normalized[0]
        if len(normalized) > 1 and normalized[1] in ("b", "#"):
            root += normalized[1]
    if not root:
        return fallback_symbol

    suffix = normalized[len(root):].strip()
    suffix_lower = suffix.lower()

    if not suffix:
        return root
    if suffix_lower.startswith("maj7"):
        return root + "maj7"
    if suffix_lower.startswith("m7b5") or suffix_lower.startswith("ø7"):
        return root + "m7b5"
    if suffix_lower.startswith("dim7"):
        return root + "dim7"
    if suffix_lower.startswith("dim"):
        return root + "dim"
    if suffix_lower.startswith("m7") or suffix_lower.startswith("min7"):
        return root + "m7"
    if suffix_lower.startswith("m") and not suffix_lower.startswith("maj"):
        return root + "m"
    if suffix_lower.startswith("7"):
        return root + "7"
    if suffix_lower.startswith("6"):
        return root + "6"
    if suffix_lower.startswith("9"):
        return root + "9"
    if suffix_lower.startswith("sus"):
        return root + "sus"
    if suffix_lower.startswith("add"):
        return root
    if "#" in suffix_lower or "b" in suffix_lower:
        if "7" in suffix_lower:
            return root + "7"
        return root
    return root


def measure_duration_quarters(measure_obj: Any) -> float:
    duration = float(getattr(getattr(measure_obj, "barDuration", None), "quarterLength", 0.0) or 0.0)
    if duration > 0:
        return duration
    return float(getattr(getattr(measure_obj, "duration", None), "quarterLength", 4.0) or 4.0)


def collect_measure_candidates(measure_obj: Any, harmony_mod: Any, chord_mod: Any, fallback_symbol: str, simplify_for_mma: bool) -> List[Dict[str, Any]]:
    candidates: List[Dict[str, Any]] = []
    for item in measure_obj.recurse().getElementsByClass(chord_mod.Chord):
        quarter_length = float(getattr(getattr(item, "duration", None), "quarterLength", 0.0) or 0.0)
        offset = float(getattr(item, "offset", 0.0) or 0.0)
        beat_strength = float(getattr(item, "beatStrength", 0.0) or 0.0)
        candidates.append({
            "quarterLength": quarter_length,
            "offsetBeats": offset,
            "beatStrength": beat_strength,
            "chord": item,
        })
    candidates.sort(key=lambda entry: (entry["offsetBeats"], -entry["quarterLength"]))

    resolved: List[Dict[str, Any]] = []
    for candidate in candidates:
        chord_obj = candidate["chord"]
        try:
            symbol_obj = harmony_mod.chordSymbolFromChord(chord_obj)
            figure = str(getattr(symbol_obj, "figure", "") or "").strip()
            if not figure or "Cannot Be Identified" in figure:
                continue
            chord_type = ""
            try:
                _, chord_type = harmony_mod.chordSymbolFigureFromChord(chord_obj, True)
            except Exception:
                chord_type = ""
            normalized_figure = normalize_symbol(figure)
            if simplify_for_mma:
                normalized_figure = simplify_symbol_for_mma(normalized_figure, fallback_symbol)
            confidence = 0.9 if chord_type else 0.75
            resolved.append({
                "symbol": normalized_figure,
                "offsetBeats": float(candidate["offsetBeats"]),
                "quarterLength": float(candidate["quarterLength"]),
                "beatStrength": float(candidate["beatStrength"]),
                "confidence": confidence,
                "source": "music21-chordify",
            })
        except Exception:
            continue
    return resolved


def select_measure_segments(
    measure_obj: Any,
    harmony_mod: Any,
    chord_mod: Any,
    fallback_symbol: str,
    simplify_for_mma: bool,
    harmonic_rhythm: str,
    max_changes_per_measure: int,
) -> List[Dict[str, Any]]:
    candidates = collect_measure_candidates(measure_obj, harmony_mod, chord_mod, fallback_symbol, simplify_for_mma)
    if not candidates:
        return [{
            "symbol": fallback_symbol,
            "offsetBeats": 0.0,
            "quarterLength": measure_duration_quarters(measure_obj),
            "beatStrength": 1.0,
            "confidence": 0.25,
            "source": "tonic-fallback",
        }]

    deduped: List[Dict[str, Any]] = []
    seen_offsets = set()
    for candidate in candidates:
        offset_key = round(float(candidate["offsetBeats"]), 3)
        if offset_key in seen_offsets:
            continue
        seen_offsets.add(offset_key)
        if deduped and deduped[-1]["symbol"] == candidate["symbol"]:
            continue
        deduped.append(candidate)

    if not deduped:
        return [{
            "symbol": fallback_symbol,
            "offsetBeats": 0.0,
            "quarterLength": measure_duration_quarters(measure_obj),
            "beatStrength": 1.0,
            "confidence": 0.25,
            "source": "tonic-fallback",
        }]

    if harmonic_rhythm == "measure":
        base = max(deduped, key=lambda entry: (entry["quarterLength"], -entry["offsetBeats"]))
        return [{**base, "offsetBeats": 0.0}]

    bar_quarters = measure_duration_quarters(measure_obj)
    max_segments = max(1, int(max_changes_per_measure))
    selected = [deduped[0]]
    for candidate in deduped[1:]:
        if len(selected) >= max_segments:
            break
        if candidate["symbol"] == selected[-1]["symbol"]:
            continue
        offset = float(candidate["offsetBeats"])
        if harmonic_rhythm == "auto":
            if offset < (bar_quarters / 2.0) and float(candidate["beatStrength"]) < 0.5:
                continue
        selected.append(candidate)

    selected[0]["offsetBeats"] = 0.0
    return selected


def serialize_score_to_musicxml(score_obj: Any) -> str:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".musicxml") as handle:
        path = handle.name
    try:
        with py_warnings.catch_warnings():
            py_warnings.simplefilter("ignore")
            score_obj.write("musicxml", fp=path)
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read()
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def append_captured_warnings(target: List[str], captured: List[Any]) -> None:
    seen = set(target)
    for warning in captured:
        message = str(getattr(warning, "message", "") or "").strip()
        if not message:
            continue
        normalized = f"music21 import warning: {message}"
        if normalized in seen:
            continue
        target.append(normalized)
        seen.add(normalized)


def primary_part_or_stream(stream_obj: Any, stream_mod: Any) -> Any:
    parts = list(getattr(stream_obj, "parts", []))
    if parts:
        return parts[0]
    if isinstance(stream_obj, stream_mod.Part):
        return stream_obj
    return stream_obj


def main() -> int:
    request = read_request()
    xml = str(request.get("xml") or "")
    settings = request.get("settings") or {}

    if not xml.strip():
        emit(error_payload("invalid_request", "Missing MusicXML input."))
        return 0

    try:
        from music21 import converter, harmony, stream, chord  # type: ignore
    except Exception as exc:
        emit(error_payload(
            "dependency_missing",
            "music21 is not available in this runtime.",
            {"detail": str(exc)},
        ))
        return 0

    try:
        with py_warnings.catch_warnings(record=True) as captured_warnings:
            py_warnings.simplefilter("always")
            score = converter.parseData(xml)
    except Exception as exc:
        emit(error_payload(
            "invalid_musicxml",
            "MusicXML could not be parsed by music21.",
            {"detail": str(exc)},
        ))
        return 0

    insert_harmony = bool(settings.get("insertHarmony", True))
    prefer_local_key = bool(settings.get("preferLocalKey", True))
    include_roman = bool(settings.get("includeRomanNumerals", False))
    simplify_for_mma = bool(settings.get("simplifyForMma", True))
    existing_mode = str(settings.get("existingHarmonyMode") or "fill-missing").strip().lower()
    harmonic_rhythm = str(settings.get("harmonicRhythm") or "auto").strip().lower()
    max_changes_per_measure = max(1, int(settings.get("maxChangesPerMeasure") or 2))

    warnings: List[str] = []
    append_captured_warnings(warnings, captured_warnings)
    if include_roman:
        warnings.append("Roman numeral output is not enabled in the Phase 1 skeleton.")

    try:
        score_key = score.analyze("key")
    except Exception:
        score_key = None
        warnings.append("Global key analysis failed; defaulting tonic fallback to C.")

    fallback_symbol = tonic_symbol(score_key) if score_key is not None else "C"
    chordified = score.chordify()
    parts = list(score.parts)
    target_part = parts[0] if parts else score

    if existing_mode == "replace":
        for measure_obj in target_part.recurse().getElementsByClass(stream.Measure):
            for existing in list(measure_obj.recurse().getElementsByClass(harmony.Harmony)):
                active_site = getattr(existing, "activeSite", None)
                if active_site is not None:
                    active_site.remove(existing)

    segments: List[Dict[str, Any]] = []
    tagged_count = 0
    fallback_count = 0
    preserved_existing_count = 0
    suppressed_changes = 0
    source_counts = Counter()
    tagged_measure_numbers = set()

    chordified_part = primary_part_or_stream(chordified, stream)
    source_measures = list(chordified_part.recurse().getElementsByClass(stream.Measure))
    local_keys = []
    for source_measure in source_measures:
        try:
            local_keys.append(source_measure.analyze("key") if prefer_local_key else score_key)
        except Exception:
            local_keys.append(score_key)
    local_keys = smooth_measure_keys(local_keys, score_key)

    target_measure_by_number = {}
    for measure_obj in target_part.recurse().getElementsByClass(stream.Measure):
        number = getattr(measure_obj, "number", None)
        if number is not None and number not in target_measure_by_number:
            target_measure_by_number[number] = measure_obj

    for source_measure, measure_key in zip(source_measures, local_keys):
        measure_number = getattr(source_measure, "number", None)
        if measure_number is None:
            continue
        target_measure = target_measure_by_number.get(measure_number)
        if target_measure is None:
            continue

        existing_harmony = list(target_measure.recurse().getElementsByClass(harmony.Harmony))
        if existing_harmony and existing_mode in ("preserve", "fill-missing"):
            preserved_existing_count += 1
            continue

        measure_fallback_symbol = tonic_symbol(measure_key) if measure_key is not None else fallback_symbol
        raw_candidates = collect_measure_candidates(source_measure, harmony, chord, measure_fallback_symbol, simplify_for_mma)
        chosen_segments = select_measure_segments(
            source_measure,
            harmony,
            chord,
            measure_fallback_symbol,
            simplify_for_mma,
            harmonic_rhythm,
            max_changes_per_measure,
        )
        if len(raw_candidates) > len(chosen_segments):
            suppressed_changes += (len(raw_candidates) - len(chosen_segments))

        for chosen in chosen_segments:
            source_counts[chosen["source"]] += 1
            if chosen["source"] == "tonic-fallback":
                fallback_count += 1

            segment = {
                "measure": int(measure_number),
                "offsetBeats": chosen["offsetBeats"],
                "symbol": chosen["symbol"],
                "roman": None,
                "key": key_name(measure_key),
                "confidence": chosen["confidence"],
                "source": chosen["source"],
            }
            segments.append(segment)

            if insert_harmony:
                try:
                    tag = harmony.ChordSymbol(chosen["symbol"])
                except Exception:
                    tag = harmony.NoChord()
                target_measure.insert(float(chosen["offsetBeats"]), tag)
                tagged_count += 1
                tagged_measure_numbers.add(int(measure_number))

    if suppressed_changes > 0:
        warnings.append(f"Suppressed {suppressed_changes} intra-measure harmony change(s) to respect harmonic-rhythm limits.")

    output_xml = serialize_score_to_musicxml(score)

    analysis = {
        "measureCount": len(source_measures),
        "taggedMeasureCount": len(tagged_measure_numbers),
        "harmonyTagCount": tagged_count,
        "coverage": round((len(tagged_measure_numbers) / len(source_measures)), 3) if source_measures else 0.0,
        "localKeyStrategy": "measure-analyze-key-smoothed" if prefer_local_key else "score-analyze-key",
        "harmonicRhythm": harmonic_rhythm,
        "existingHarmonyMode": existing_mode,
        "existingHarmonyPreservedCount": preserved_existing_count,
        "fallbackCount": fallback_count,
        "sourceBreakdown": dict(source_counts),
        "suppressedChangeCount": suppressed_changes,
    }

    emit({
        "ok": True,
        "engine": "music21",
        "analysis": analysis,
        "warnings": warnings,
        "segments": segments,
        "content": {
            "musicxml": output_xml,
        },
    })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
