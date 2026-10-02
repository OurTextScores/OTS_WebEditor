'use client';

import { useMemo, useRef, useState, type ChangeEvent } from 'react';

/**
 * Multitrack MusicVAE sidebar panel. Calls the `music.multitrack_vae` service
 * (`/api/music/multitrack-vae/generate`), which runs Magenta's multitrack MusicVAE on
 * a Hugging Face Gradio Space and returns MIDI + MusicXML.
 *
 * See docs/private/music-ai-specialists/multitrack-musicvae-hf-space-runbook.md.
 */

type MultitrackVaeMode =
  'sample' | 'chord_progression' | 'style_interpolation' | 'reconstruct' | 'encode_interpolation';

type MultitrackVaeModel = 'chords' | 'unconditioned';

export type MultitrackVaePanelProps = {
  /** ScoreEditor's authenticated JSON POST helper (handles proxy base + trace). */
  postJson: (path: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** Whether a score is currently loaded (enables apply + "use current score"). */
  hasScore: boolean;
  /** Export the open score to base64 MIDI (no data-url prefix), or null if unavailable. */
  getCurrentScoreMidiBase64: () => Promise<string | null>;
  /** Apply generated MusicXML to the score (overwrite the score or append measures). */
  onApplyXml: (xml: string, mode: 'overwrite' | 'append') => Promise<void>;
};

const MODE_LABELS: Record<MultitrackVaeMode, string> = {
  sample: 'Random samples',
  chord_progression: 'Chord progression',
  style_interpolation: 'Style interpolation',
  reconstruct: 'Reconstruct measure',
  encode_interpolation: 'Blend two measures',
};

const MODE_HELP: Record<MultitrackVaeMode, string> = {
  sample: 'Generate a few independent 1-bar multitrack ideas, optionally over one chord.',
  chord_progression:
    'Hold one style fixed and realize it over a chord progression (one bar per chord).',
  style_interpolation:
    'Morph between two random styles across N bars, optionally following a repeating chord progression.',
  reconstruct: 'Encode a measure from the current score / an uploaded MIDI, then decode it back.',
  encode_interpolation: 'Interpolate between two measures of the input across N bars.',
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const usesChordList = (mode: MultitrackVaeMode) =>
  mode === 'chord_progression' || mode === 'style_interpolation';
const usesSingleChord = (mode: MultitrackVaeMode) => mode === 'sample';
const usesNumBars = (mode: MultitrackVaeMode) =>
  mode === 'style_interpolation' || mode === 'encode_interpolation';
const usesInputMidi = (mode: MultitrackVaeMode) =>
  mode === 'reconstruct' || mode === 'encode_interpolation';

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export function MultitrackVaePanel({
  postJson,
  hasScore,
  getCurrentScoreMidiBase64,
  onApplyXml,
}: MultitrackVaePanelProps) {
  const [mode, setMode] = useState<MultitrackVaeMode>('chord_progression');
  const [model, setModel] = useState<MultitrackVaeModel>('chords');
  const [chord, setChord] = useState('C');
  const [chords, setChords] = useState('C, Am, F, G');
  const [temperature, setTemperature] = useState(0.2);
  const [numBars, setNumBars] = useState(16);
  const [numSamples, setNumSamples] = useState(4);
  const [index, setIndex] = useState(0);
  const [index1, setIndex1] = useState(0);
  const [index2, setIndex2] = useState(1);
  const [inputMidiBase64, setInputMidiBase64] = useState('');
  const [inputMidiLabel, setInputMidiLabel] = useState('');

  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [numMeasures, setNumMeasures] = useState<number | null>(null);
  const [generatedXml, setGeneratedXml] = useState('');
  const [generatedMidiBase64, setGeneratedMidiBase64] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const chordModeForced = useMemo(
    () =>
      (usesChordList(mode) && chords.trim().length > 0) ||
      (usesSingleChord(mode) && chord.trim().length > 0),
    [mode, chords, chord],
  );

  const resetOutput = () => {
    setError(null);
    setWarnings([]);
    setNumMeasures(null);
    setGeneratedXml('');
    setGeneratedMidiBase64('');
  };

  const handleUseCurrentScore = async () => {
    setError(null);
    try {
      const base64 = await getCurrentScoreMidiBase64();
      if (!base64) {
        setError('Could not export the current score to MIDI in this build.');
        return;
      }
      setInputMidiBase64(base64);
      setInputMidiLabel('Current score');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read the current score.');
    }
  };

  const handleUploadMidi = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const base64 = await readFileAsBase64(file);
      setInputMidiBase64(base64);
      setInputMidiLabel(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read the MIDI file.');
    }
  };

  const handleGenerate = async () => {
    resetOutput();
    if (usesInputMidi(mode) && !inputMidiBase64) {
      setError('Choose a MIDI source (current score or upload) before running this mode.');
      return;
    }
    const chordList = chords
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    if (mode === 'chord_progression' && chordList.length === 0) {
      setError('Enter at least one chord for a chord progression.');
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        mode,
        model,
        temperature,
        convertToMusicXml: true,
        includeContent: true,
      };
      if (usesSingleChord(mode) && chord.trim()) body.chord = chord.trim();
      if (usesChordList(mode) && chordList.length > 0) body.chords = chordList;
      if (usesNumBars(mode)) body.numBars = numBars;
      if (mode === 'sample') body.numSamples = numSamples;
      if (usesInputMidi(mode)) body.inputMidiBase64 = inputMidiBase64;
      if (mode === 'reconstruct') body.index = index;
      if (mode === 'encode_interpolation') {
        body.index1 = index1;
        body.index2 = index2;
      }

      const payload = await postJson('/api/music/multitrack-vae/generate', body);
      const content = asRecord(payload.content);
      const midiBase64 = typeof content?.midiBase64 === 'string' ? content.midiBase64 : '';
      const musicxml = typeof content?.musicxml === 'string' ? content.musicxml : '';
      setGeneratedMidiBase64(midiBase64);
      setGeneratedXml(musicxml);
      setNumMeasures(typeof payload.numMeasures === 'number' ? payload.numMeasures : null);
      const payloadWarnings = Array.isArray(payload.warnings)
        ? payload.warnings.filter((w): w is string => typeof w === 'string')
        : [];
      setWarnings(payloadWarnings);
      const conversionError = asRecord(payload.conversionError);
      const conversionErrorMessage =
        typeof conversionError?.message === 'string' ? conversionError.message : '';
      if (!musicxml.trim() && conversionErrorMessage) {
        setWarnings((prev) => [...prev, `MusicXML conversion failed: ${conversionErrorMessage}`]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Multitrack MusicVAE request failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadMidi = () => {
    if (!generatedMidiBase64) return;
    const blob = base64ToBlob(generatedMidiBase64, 'audio/midi');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `multitrack-vae-${mode}.mid`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handleApply = async (applyMode: 'overwrite' | 'append') => {
    if (!generatedXml.trim()) {
      setError('No MusicXML is available to apply yet.');
      return;
    }
    setApplying(true);
    setError(null);
    try {
      await onApplyXml(generatedXml, applyMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply the generated MusicXML.');
    } finally {
      setApplying(false);
    }
  };

  const labelClass = 'text-xs font-semibold uppercase tracking-wide text-slate-500';
  const fieldClass = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700';

  return (
    <div className="mt-3 space-y-3 text-sm text-slate-700">
      <div className="rounded border border-slate-200 bg-slate-50/70 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Multitrack MusicVAE
          </div>
          <a
            href="https://magenta.tensorflow.org/multitrack"
            target="_blank"
            rel="noreferrer"
            title="Multitrack MusicVAE"
            aria-label="About Multitrack MusicVAE"
            className="text-sm leading-none text-slate-500 hover:text-slate-700"
          >
            ⓘ
          </a>
        </div>

        <div className="grid gap-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Mode</span>
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as MultitrackVaeMode);
                resetOutput();
              }}
              className={fieldClass}
              aria-label="Generation mode"
            >
              {(Object.keys(MODE_LABELS) as MultitrackVaeMode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABELS[m]}
                </option>
              ))}
            </select>
            <span className="text-[11px] leading-snug text-slate-500">{MODE_HELP[mode]}</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Model</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as MultitrackVaeModel)}
              className={fieldClass}
              aria-label="Model checkpoint"
            >
              <option value="chords">Chord-conditioned</option>
              <option value="unconditioned">Unconditioned</option>
            </select>
            {chordModeForced && model !== 'chords' && (
              <span className="text-[11px] leading-snug text-amber-600">
                Chord input provided — the chord-conditioned model will be used.
              </span>
            )}
          </label>

          {usesSingleChord(mode) && (
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Chord (optional)</span>
              <input
                value={chord}
                onChange={(e) => setChord(e.target.value)}
                placeholder="e.g. C, Am, F"
                className={fieldClass}
                aria-label="Chord"
              />
            </label>
          )}

          {usesChordList(mode) && (
            <label className="flex flex-col gap-1">
              <span className={labelClass}>
                Chords {mode === 'style_interpolation' ? '(optional, repeating)' : '(one bar each)'}
              </span>
              <input
                value={chords}
                onChange={(e) => setChords(e.target.value)}
                placeholder="C, Am, F, G"
                className={fieldClass}
                aria-label="Chord progression"
              />
              <span className="text-[11px] leading-snug text-slate-500">
                Triads only, comma-separated (C, Cm, Caug, Am, F, G).
              </span>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Temperature: {temperature.toFixed(2)}</span>
            <input
              type="range"
              min={0.01}
              max={1.5}
              step={0.01}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              aria-label="Temperature"
            />
          </label>

          {usesNumBars(mode) && (
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Bars: {numBars}</span>
              <input
                type="range"
                min={4}
                max={64}
                step={1}
                value={numBars}
                onChange={(e) => setNumBars(Math.floor(Number(e.target.value)))}
                aria-label="Number of bars"
              />
            </label>
          )}

          {mode === 'sample' && (
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Samples</span>
              <input
                type="number"
                min={1}
                max={8}
                step={1}
                value={numSamples}
                onChange={(e) => {
                  const v = Math.floor(Number(e.target.value));
                  if (Number.isFinite(v)) setNumSamples(Math.min(8, Math.max(1, v)));
                }}
                className={fieldClass}
                aria-label="Number of samples"
              />
            </label>
          )}

          {usesInputMidi(mode) && (
            <div className="flex flex-col gap-2 rounded border border-dashed border-slate-300 p-2">
              <span className={labelClass}>Input MIDI</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleUseCurrentScore}
                  disabled={!hasScore || busy}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  Use current score
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  Upload MIDI…
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mid,.midi,audio/midi"
                  className="hidden"
                  onChange={handleUploadMidi}
                />
              </div>
              {inputMidiLabel && (
                <span className="truncate text-[11px] text-slate-500">
                  Source: {inputMidiLabel}
                </span>
              )}
              <div className="flex flex-wrap gap-2">
                {mode === 'reconstruct' && (
                  <label className="flex flex-col gap-1">
                    <span className={labelClass}>Measure</span>
                    <input
                      type="number"
                      min={0}
                      value={index}
                      onChange={(e) =>
                        setIndex(Math.max(0, Math.floor(Number(e.target.value) || 0)))
                      }
                      className={`${fieldClass} w-20`}
                      aria-label="Measure index"
                    />
                  </label>
                )}
                {mode === 'encode_interpolation' && (
                  <>
                    <label className="flex flex-col gap-1">
                      <span className={labelClass}>Measure A</span>
                      <input
                        type="number"
                        min={0}
                        value={index1}
                        onChange={(e) =>
                          setIndex1(Math.max(0, Math.floor(Number(e.target.value) || 0)))
                        }
                        className={`${fieldClass} w-20`}
                        aria-label="Measure index A"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={labelClass}>Measure B</span>
                      <input
                        type="number"
                        min={0}
                        value={index2}
                        onChange={(e) =>
                          setIndex2(Math.max(0, Math.floor(Number(e.target.value) || 0)))
                        }
                        className={`${fieldClass} w-20`}
                        aria-label="Measure index B"
                      />
                    </label>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={busy}
          className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? 'Generating…' : 'Generate'}
        </button>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
            {error}
          </div>
        )}
        {warnings.length > 0 && (
          <ul className="list-disc space-y-0.5 rounded border border-amber-200 bg-amber-50 px-4 py-1 text-xs text-amber-700">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </div>

      {(generatedMidiBase64 || generatedXml) && (
        <div className="rounded border border-slate-200 bg-white p-3 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Result
            {numMeasures !== null ? ` · ${numMeasures} bar${numMeasures === 1 ? '' : 's'}` : ''}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownloadMidi}
              disabled={!generatedMidiBase64}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Download MIDI
            </button>
            <button
              type="button"
              onClick={() => handleApply('overwrite')}
              disabled={!generatedXml || applying}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {hasScore ? 'Replace score' : 'Open as score'}
            </button>
            <button
              type="button"
              onClick={() => handleApply('append')}
              disabled={!generatedXml || applying || !hasScore}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Append to score
            </button>
          </div>
          {!generatedXml && generatedMidiBase64 && (
            <p className="text-[11px] text-slate-500">
              MusicXML unavailable — download the MIDI instead.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
