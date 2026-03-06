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

    sys.stdout.write(json.dumps({
        "ok": True,
        "engine": "music21-roman",
        "analysis": {
            "movementCount": 1,
            "measureCount": 2,
            "segmentCount": 2,
            "localKeyCount": 1,
            "modulationCount": 0,
            "cadenceCount": 1,
            "coverage": 1.0,
            "engine": "music21-roman",
            "engineMode": "deterministic",
            "granularity": "measure",
            "unresolvedMeasureCount": 0,
        },
        "warnings": [
            "Cadence labels are heuristic in the Phase 1 functional backend.",
        ],
        "segments": [
            {
                "movementIndex": 0,
                "measureIndex": 1,
                "measureNumber": "1",
                "startBeat": 1,
                "romanNumeral": "I",
                "key": "C major",
                "functionLabel": "tonic",
                "cadenceLabel": None,
                "confidence": 0.8,
                "source": "music21-roman",
            },
            {
                "movementIndex": 0,
                "measureIndex": 2,
                "measureNumber": "2",
                "startBeat": 1,
                "romanNumeral": "V",
                "key": "C major",
                "functionLabel": "dominant",
                "cadenceLabel": "authentic",
                "confidence": 0.8,
                "source": "music21-roman",
            },
        ],
        "keys": [
            {
                "startMeasureIndex": 1,
                "endMeasureIndex": 2,
                "key": "C major",
                "measureCount": 2,
            }
        ],
        "cadences": [
            {
                "measureIndex": 2,
                "measureNumber": "2",
                "label": "authentic",
                "confidence": 0.8,
            }
        ],
        "annotatedXml": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><score-partwise version=\"3.1\"><part-list><score-part id=\"P1\"><part-name>Music</part-name></score-part></part-list><part id=\"P1\"><measure number=\"1\"><direction placement=\"below\"><direction-type><words>I</words></direction-type></direction><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note></measure></part></score-partwise>",
        "exports": {
            "json": "{\"analysis\":true}",
            "rntxt": "m1 I [C major]\\nm2 V [C major]\\n",
        },
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
