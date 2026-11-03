# MEI conformance fixtures

MuseScore 4.7.4's own MEI tests (`src/importexport/mei/tests/data`, GPLv3): each `<name>.mei` with the `<name>.mscx`
MuseScore imports it to. `scripts/mei-conformance-probe.mjs` imports and re-exports every pair through the engine;
`unit/mei-conformance-engine.test.ts` runs it. Copy them again from upstream when the engine moves to a new MuseScore
release.
