# Format compatibility fixtures

Scores written by newer MuseScore versions, used by `unit/format-compat.test.ts` via `scripts/format-compat-probe.mjs`.
Each is an upstream MuseScore test score (GPLv3, github.com/musescore/MuseScore) wrapped as a minimal `.mscz`.

| Fixture | Upstream source | Exercises |
|---|---|---|
| `lasteid-4.20.mscz` | `v4.7.4` `src/engraving/tests/playback/playbackcontext_data/sound_flags/cancel_playing_technique.mscx` (saved by 4.4.0) | `<LastEID>` before `<Score>`, as written by 4.2–4.4 |
| `keysig-concertkey-4.70.mscz` | `v4.7.4` `src/engraving/tests/compat114_data/keysig-ref.mscx` | `<concertKey>`/`<actualKey>` key signatures (4.1+) |
| `text-linebreak-4.70.mscz` | `main` `src/engraving/tests/rhythmicGrouping_data/group8ths4-4-ref.mscx`, version attribute changed from 5.00 to 4.70 | `<br/>` line breaks in text (4.7+) |
