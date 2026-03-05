#!/usr/bin/env python3
import json
import sys


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    xml = payload.get("xml") or ""
    if not xml.strip():
        sys.stdout.write(json.dumps({
            "ok": False,
            "error": {
                "code": "invalid_request",
                "message": "Missing MusicXML input.",
            },
        }))
        return 0

    tagged = xml.replace(
        "</measure>",
        "<harmony print-frame=\"no\"><root><root-step>C</root-step></root><kind>major</kind></harmony></measure>",
        1,
    )
    sys.stdout.write(json.dumps({
        "ok": True,
        "engine": "music21",
        "analysis": {
            "measureCount": 1,
            "taggedMeasureCount": 1,
            "harmonyTagCount": 1,
            "coverage": 1.0,
            "localKeyStrategy": "measure-analyze-key-smoothed",
            "harmonicRhythm": "measure",
            "existingHarmonyMode": "fill-missing",
            "existingHarmonyPreservedCount": 0,
            "fallbackCount": 0,
            "sourceBreakdown": {
                "music21-chordify": 1,
            },
        },
        "warnings": [
            "Phase 1 skeleton is using score-level key analysis; local key tracking is not yet enabled.",
        ],
        "segments": [
            {
                "measure": 1,
                "offsetBeats": 0,
                "symbol": "C",
                "roman": None,
                "key": "C major",
                "confidence": 0.9,
                "source": "music21-chordify",
            }
        ],
        "content": {
            "musicxml": tagged,
        },
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
