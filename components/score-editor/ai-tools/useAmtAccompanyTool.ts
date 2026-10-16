import { useState } from 'react';
import { asRecord } from '../../../lib/as-record';
import { appendMusicXmlParts } from '../../../lib/musicxml-append-parts';
import { placeMusicXmlPartsAtMeasure } from '../../../lib/musicxml-part-placement';
import type { Score } from '../../../lib/webmscore-loader';
import { decodeBase64ToBytes, encodeBase64 } from '../byte-encoding';
import { downloadBlob } from '../download-blob';
import type { ApplyXmlToScore } from '../editor-types';
import { errorMessage } from '../error-messages';
import type { AmtAccompanyPanelProps, AmtModel, GeneratedPartSummary } from './AmtAccompanyPanel';
import { midiToMusicXml } from './midiToMusicXml';
import {
  readAccompanySource,
  sliceAccompanySource,
  type AccompanySource,
} from './amtAccompanySource';
import type React from 'react';

export type AmtAccompanyToolContext = {
  postScoreEditorJson: (
    path: string,
    body: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  score: Score | null;
  resolveXmlContext: () => Promise<string>;
  applyXmlToScore: ApplyXmlToScore;
  setXmlLoading: React.Dispatch<React.SetStateAction<boolean>>;
  revealScoreSource: () => void;
};

type AccompanyResult = {
  musicXml: string;
  partsMidiBase64: string;
  parts: GeneratedPartSummary[];
  /** The source the result was generated from; adding it places it at that range. */
  source: AccompanySource;
};

const readStrings = (value: unknown) =>
  Array.isArray(value) ? value.filter((w): w is string => typeof w === 'string') : [];

function readParts(value: unknown): GeneratedPartSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = asRecord(item);
    if (!record || typeof record.instrument !== 'string') return [];
    return [
      {
        instrument: record.instrument,
        noteCount: typeof record.noteCount === 'number' ? record.noteCount : 0,
      },
    ];
  });
}

/**
 * Accompany (AMT): reads the selected bars, sends them to `music.infill` with the chosen
 * melody track, and adds the generated parts to the score at those bars. Adding goes
 * through `applyXmlToScore`, which checkpoints first, so it can be undone.
 */
export function useAmtAccompanyTool(ctx: AmtAccompanyToolContext) {
  const { postScoreEditorJson, score, resolveXmlContext, applyXmlToScore, setXmlLoading } = ctx;

  const [source, setSource] = useState<AccompanySource | null>(null);
  const [melodyTrack, setMelodyTrack] = useState<number | null>(null);
  const [model, setModel] = useState<AmtModel>('medium-800k');
  const [historySeconds, setHistorySeconds] = useState(5);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<AccompanyResult | null>(null);

  const readSelection = async (): Promise<AccompanySource | null> => {
    if (!score) {
      setError('Open a score first.');
      return null;
    }
    setError(null);
    try {
      const next = await readAccompanySource(score);
      setSource(next);
      setWarnings(next.warnings);
      setMelodyTrack((current) =>
        current !== null && next.tracks.some((t) => t.index === current)
          ? current
          : (next.tracks[0]?.index ?? null),
      );
      return next;
    } catch (err) {
      setError(errorMessage(err));
      return null;
    }
  };

  const generate = async () => {
    const current = source ?? (await readSelection());
    if (!current) return;
    // State set by a read just now is not visible in this call yet; fall back the same way.
    const track = current.tracks.some((t) => t.index === melodyTrack)
      ? melodyTrack
      : (current.tracks[0]?.index ?? null);
    if (track === null) {
      setError('Choose the part that carries the melody.');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const payload = await postScoreEditorJson('/api/music/infill', {
        mode: 'accompany',
        inputMidiBase64: encodeBase64(sliceAccompanySource(current)),
        melodyTrack: track,
        model,
        historySeconds,
        convertToMusicXml: true,
        includeContent: true,
      });
      if (payload.ok === false) {
        throw new Error(
          typeof payload.error === 'string' ? payload.error : 'Accompaniment failed.',
        );
      }
      const content = asRecord(payload.content);
      const partsMidiBase64 =
        typeof content?.accompanimentMidiBase64 === 'string' ? content.accompanimentMidiBase64 : '';
      let musicXml = typeof content?.musicxml === 'string' ? content.musicxml : '';
      const serviceWarnings = readStrings(payload.warnings);
      const conversionError = asRecord(payload.conversionError);
      let conversionWarnings: string[] = [];
      if (!musicXml.trim() && partsMidiBase64) {
        // The server could not convert (no MuseScore CLI there); the engine can.
        try {
          musicXml = await midiToMusicXml(decodeBase64ToBytes(partsMidiBase64));
        } catch (err) {
          conversionWarnings = [
            `MusicXML conversion failed: ${
              typeof conversionError?.message === 'string'
                ? conversionError.message
                : errorMessage(err)
            }`,
          ];
        }
      }
      setWarnings([
        ...current.warnings,
        ...(musicXml.trim()
          ? serviceWarnings.filter((w) => !/could not convert it to MusicXML/.test(w))
          : serviceWarnings),
        ...conversionWarnings,
      ]);
      setResult({
        musicXml,
        partsMidiBase64,
        parts: readParts(payload.generatedParts),
        source: current,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const addToScore = async () => {
    if (!result?.musicXml.trim()) {
      setError('There is no MusicXML to add yet.');
      return;
    }
    setApplying(true);
    setXmlLoading(true);
    setError(null);
    try {
      const currentXml = await resolveXmlContext();
      if (!currentXml.trim()) throw new Error('Could not read the score as MusicXML.');
      const { measures, range } = result.source;
      // The Space names its tracks "Generated <instrument>", and MIDI import prefixes the
      // engine's own instrument name ("Violin, Generated Violin"); the score shows the instrument.
      const named = result.musicXml.replace(/(<part-name[^>]*>)(?:[^<]*?, )?Generated /g, '$1');
      const placed = placeMusicXmlPartsAtMeasure(named, measures, range.start);
      const appended = appendMusicXmlParts(currentXml, placed.xml);
      const applied = await applyXmlToScore(appended.xml, {
        telemetrySource: 'amt_accompany_apply',
        inputFormat: 'musicxml',
      });
      if (applied) {
        setWarnings((prev) => [...prev, ...placed.warnings, ...appended.warnings]);
        ctx.revealScoreSource();
        // Bar layout and tracks change once parts are added; read them again before the next run.
        setSource(null);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setApplying(false);
      setXmlLoading(false);
    }
  };

  const downloadMidi = () => {
    if (!result?.partsMidiBase64) return;
    downloadBlob(
      decodeBase64ToBytes(result.partsMidiBase64),
      'amt-accompaniment.mid',
      'audio/midi',
    );
  };

  const panel: AmtAccompanyPanelProps = {
    source: {
      hasScore: Boolean(score),
      range: source ? { start: source.range.start + 1, end: source.range.end + 1 } : null,
      tracks: source?.tracks ?? [],
      readSelection: () => void readSelection(),
    },
    settings: {
      melodyTrack,
      model,
      historySeconds,
      setMelodyTrack,
      setModel,
      setHistorySeconds,
    },
    status: { busy, applying, error, warnings },
    result: result
      ? {
          parts: result.parts,
          canAdd: Boolean(result.musicXml.trim()),
          canDownload: Boolean(result.partsMidiBase64),
        }
      : null,
    actions: {
      generate: () => void generate(),
      addToScore: () => void addToScore(),
      downloadMidi,
    },
  };

  return { panel };
}
