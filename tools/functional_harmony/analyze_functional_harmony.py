#!/usr/bin/env python3
import json
import sys
import tempfile
import warnings as py_warnings
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple


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


def collect_measure_chords(measure_obj: Any, chord_mod: Any) -> List[Any]:
    chords = list(measure_obj.recurse().getElementsByClass(chord_mod.Chord))
    chords.sort(key=lambda item: (float(getattr(item, "offset", 0.0) or 0.0), -float(getattr(getattr(item, "duration", None), "quarterLength", 0.0) or 0.0)))
    return chords


def choose_measure_chord(chords: List[Any]) -> Any:
    if not chords:
        return None
    return max(
        chords,
        key=lambda item: (
            float(getattr(getattr(item, "duration", None), "quarterLength", 0.0) or 0.0),
            float(getattr(item, "beatStrength", 0.0) or 0.0),
            -float(getattr(item, "offset", 0.0) or 0.0),
        ),
    )


def roman_text(roman_obj: Any) -> str:
    figure = str(getattr(roman_obj, "figure", "") or "").strip()
    return figure


def cadence_label(previous_rn: Optional[str], current_rn: Optional[str]) -> Optional[str]:
    if not current_rn:
        return None
    normalized = current_rn.replace(" ", "")
    prev = (previous_rn or "").replace(" ", "")
    if normalized.startswith("I") and prev.startswith("V"):
        return "authentic"
    if normalized.startswith("i") and prev.startswith("V"):
        return "authentic"
    if normalized.startswith("I") and prev.startswith("IV"):
        return "plagal"
    return None


def build_rntxt(segments: List[Dict[str, Any]]) -> str:
    lines: List[str] = []
    for segment in segments:
        measure_number = segment.get("measureNumber") or segment.get("measureIndex") or "?"
        roman_numeral = segment.get("romanNumeral") or "?"
        key = segment.get("key") or "unknown key"
        lines.append(f"m{measure_number} {roman_numeral} [{key}]")
    return "\n".join(lines).strip() + ("\n" if lines else "")


def export_score_xml(score_obj: Any) -> str:
    with tempfile.NamedTemporaryFile(suffix=".musicxml") as handle:
        score_obj.write("musicxml", fp=handle.name)
        handle.seek(0)
        return handle.read().decode("utf-8")


def annotate_score_with_roman_numerals(score_obj: Any, segments: List[Dict[str, Any]], stream_mod: Any, expressions_mod: Any) -> str:
    target_part = primary_part_or_stream(score_obj, stream_mod)
    measures = list(target_part.recurse().getElementsByClass(stream_mod.Measure))
    for segment in segments:
        roman_numeral = str(segment.get("romanNumeral") or "").strip()
        if not roman_numeral:
            continue
        measure_index = int(segment.get("measureIndex") or 0)
        if measure_index <= 0 or measure_index > len(measures):
            continue
        target_measure = measures[measure_index - 1]
        annotation = expressions_mod.TextExpression(roman_numeral)
        try:
            annotation.placement = "below"
        except Exception:
            pass
        style = getattr(annotation, "style", None)
        if style is not None:
            try:
                style.relativeY = -35
            except Exception:
                pass
        target_measure.insert(0, annotation)
    return export_score_xml(score_obj)


def main() -> int:
    request = read_request()
    xml = str(request.get("xml") or "")
    settings = request.get("settings") or {}

    if not xml.strip():
        emit(error_payload("invalid_request", "Missing MusicXML input."))
        return 0

    try:
        from music21 import chord, converter, expressions, roman, stream  # type: ignore
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

    include_segments = bool(settings.get("includeSegments", True))
    include_text_export = bool(settings.get("includeTextExport", True))
    include_annotated_content = bool(settings.get("includeAnnotatedContent", False))
    prefer_local_key = bool(settings.get("preferLocalKey", True))
    detect_cadences = bool(settings.get("detectCadences", True))
    detect_modulations = bool(settings.get("detectModulations", True))
    granularity = str(settings.get("granularity") or "auto").strip().lower()

    warnings: List[str] = []
    append_captured_warnings(warnings, captured_warnings)
    if granularity != "measure":
        warnings.append("Granularity is currently measure-level in the Phase 1 functional backend.")
    if detect_cadences:
        warnings.append("Cadence labels are heuristic in the Phase 1 functional backend.")

    try:
        global_key = score.analyze("key")
    except Exception:
        global_key = None
        warnings.append("Global key analysis failed; local key tracking may be reduced.")

    chordified = score.chordify()
    source_part = primary_part_or_stream(chordified, stream)
    measures = list(source_part.recurse().getElementsByClass(stream.Measure))

    local_keys: List[Any] = []
    for measure_obj in measures:
        try:
            local_keys.append(measure_obj.analyze("key") if prefer_local_key else global_key)
        except Exception:
            local_keys.append(global_key)
    local_keys = smooth_measure_keys(local_keys, global_key)

    segments: List[Dict[str, Any]] = []
    unresolved_count = 0
    previous_roman: Optional[str] = None

    for measure_index, (measure_obj, measure_key) in enumerate(zip(measures, local_keys), start=1):
        measure_number = getattr(measure_obj, "number", None)
        chords = collect_measure_chords(measure_obj, chord)
        chosen = choose_measure_chord(chords)
        if chosen is None:
            unresolved_count += 1
            continue

        rn_figure: Optional[str] = None
        function_label: Optional[str] = None
        confidence = 0.78
        try:
            if measure_key is None:
                raise ValueError("missing local key")
            rn_obj = roman.romanNumeralFromChord(chosen, measure_key)
            rn_figure = roman_text(rn_obj) or None
            if rn_figure:
                normalized = rn_figure.replace(" ", "")
                if "/" in normalized and normalized.startswith("V"):
                    function_label = "secondary-dominant"
                elif normalized.startswith("cad64"):
                    function_label = "cadential-64"
                elif normalized.startswith("vii") or normalized.startswith("VII"):
                    function_label = "leading-tone"
                elif normalized.startswith("V"):
                    function_label = "dominant"
                elif normalized.startswith("I") or normalized.startswith("i"):
                    function_label = "tonic"
                elif normalized.startswith("IV") or normalized.startswith("iv"):
                    function_label = "predominant"
        except Exception:
            unresolved_count += 1
            continue

        cadence = cadence_label(previous_roman, rn_figure) if detect_cadences else None
        segment = {
            "movementIndex": 0,
            "measureIndex": measure_index,
            "measureNumber": measure_number if measure_number is not None else measure_index,
            "startBeat": 1,
            "endBeat": None,
            "romanNumeral": rn_figure,
            "key": key_name(measure_key),
            "functionLabel": function_label,
            "cadenceLabel": cadence,
            "confidence": confidence,
            "source": "music21-roman",
        }
        segments.append(segment)
        previous_roman = rn_figure

    if unresolved_count > 0:
        warnings.append(f"Could not assign Roman numerals for {unresolved_count}/{len(measures)} measure(s).")

    key_regions: List[Dict[str, Any]] = []
    current_key: Optional[str] = None
    start_index = 1
    for measure_index, measure_key in enumerate(local_keys, start=1):
        label = key_name(measure_key) or "unknown"
        if current_key is None:
            current_key = label
            start_index = measure_index
            continue
        if label != current_key:
            key_regions.append({
                "startMeasureIndex": start_index,
                "endMeasureIndex": measure_index - 1,
                "key": current_key,
                "measureCount": (measure_index - start_index),
            })
            current_key = label
            start_index = measure_index
    if current_key is not None:
        key_regions.append({
            "startMeasureIndex": start_index,
            "endMeasureIndex": len(local_keys),
            "key": current_key,
            "measureCount": max(0, len(local_keys) - start_index + 1),
        })

    cadences = [
        {
            "measureIndex": segment["measureIndex"],
            "measureNumber": segment["measureNumber"],
            "label": segment["cadenceLabel"],
            "confidence": segment["confidence"],
        }
        for segment in segments
        if segment.get("cadenceLabel")
    ]

    analysis = {
        "movementCount": 1,
        "measureCount": len(measures),
        "segmentCount": len(segments),
        "localKeyCount": len(key_regions),
        "modulationCount": max(0, len(key_regions) - 1) if detect_modulations else 0,
        "cadenceCount": len(cadences),
        "coverage": round((len(segments) / len(measures)), 3) if measures else 0.0,
        "engine": "music21-roman",
        "engineMode": "deterministic",
        "granularity": "measure",
        "unresolvedMeasureCount": unresolved_count,
    }

    exports = {
        "json": json.dumps({
            "engine": "music21-roman",
            "analysis": analysis,
            "segments": segments if include_segments else [],
            "keys": key_regions,
            "cadences": cadences,
            "warnings": warnings,
        }, indent=2),
    }
    if include_text_export:
        exports["rntxt"] = build_rntxt(segments)

    annotated_xml = ""
    if include_annotated_content:
        try:
            annotated_xml = annotate_score_with_roman_numerals(score, segments, stream, expressions)
        except Exception as exc:
            warnings.append(f"Could not generate annotated MusicXML: {str(exc).strip()}")

    emit({
        "ok": True,
        "engine": "music21-roman",
        "analysis": analysis,
        "warnings": warnings,
        "segments": segments if include_segments else [],
        "keys": key_regions,
        "cadences": cadences,
        "exports": exports,
        "annotatedXml": annotated_xml,
    })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
