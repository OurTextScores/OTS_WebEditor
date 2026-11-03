# MNX conformance fixtures

MuseScore 4.7.4's own MNX tests (`src/importexport/mnx/tests`, GPLv3): its project examples (`project/*.mnx`) and
the W3C MNX examples (`w3c/*.json`, from w3c/mnx at the commit mnxdom pins), each with the `_ref.mscx` MuseScore
imports it to. `cases.json` lists the cases `mnx_tests.cpp` enables, which of them MuseScore round-trips, and why
not. `scripts/mnx-conformance-probe.mjs` runs them through the engine; `unit/mnx-conformance-engine.test.ts` runs it.
Copy them again from upstream when the engine moves to a new MuseScore release.
