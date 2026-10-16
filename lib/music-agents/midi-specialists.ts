/**
 * The music router's MIDI specialists: Multitrack MusicVAE (latent multitrack measures) and
 * the Anticipatory Music Transformer (parts written under a melody the score already has).
 * Their intents, fallback runs, payload defaults and agent instructions live here, so the
 * router only dispatches to them.
 */

import { runMusicInfillService } from '../music-services/amt-infill-service';
import { runMusicMultitrackVaeService } from '../music-services/multitrack-vae-service';
import type { TraceContext } from '../trace-http';

export type MidiSpecialistToolName = 'music.multitrack_vae' | 'music.infill';

type ToolDefaultsLike = {
  context?: Record<string, unknown>;
  multitrack_vae?: Record<string, unknown>;
  infill?: Record<string, unknown>;
};

type ServiceResult = { status: number; body: Record<string, unknown> };

/** The specialist a prompt asks for, or null. Run after the chord-symbol check. */
export function classifyMidiSpecialistPrompt(normalized: string): MidiSpecialistToolName | null {
  // AMT: accompaniment as notes. MMA's "accompaniment chords" is caught before this.
  if (
    /\b(accompany|accompaniment (for|under|to)|write (an |some )?accompaniment|add (an |some )?accompaniment|backing parts?|anticipatory|amt)\b/.test(
      normalized,
    )
  ) {
    return 'music.infill';
  }
  // MusicVAE: grooves, chord-conditioned measures, style morph/interpolation. Checked before
  // the generic generate heuristic so these intents don't fall through to NotaGen.
  if (
    /\b(musicvae|music vae|multitrack|multi-track|groove|grooves|drum ?beat|latent|interpolate between styles|style morph|morph between|blend .* (measures?|styles?)|arrange over|jam)\b/.test(
      normalized,
    )
  ) {
    return 'music.multitrack_vae';
  }
  return null;
}

/** Infill works on the open score unless it was handed MIDI; borrow the context tool's session. */
function withInfillScoreSession(
  payload: Record<string, unknown>,
  toolInput: ToolDefaultsLike | undefined,
): Record<string, unknown> {
  const hasInput = ['inputMidiBase64', 'inputArtifactId', 'scoreSessionId'].some(
    (key) => typeof payload[key] === 'string' && payload[key],
  );
  const sessionId = toolInput?.context?.scoreSessionId;
  return hasInput || typeof sessionId !== 'string'
    ? payload
    : { ...payload, scoreSessionId: sessionId };
}

const SPECIALISTS = {
  'music.multitrack_vae': {
    defaultsKey: 'multitrack_vae',
    fallbackDefaults: { mode: 'sample' },
    run: runMusicMultitrackVaeService,
    done: 'Generated multitrack MusicVAE MIDI via fallback router.',
    failed: 'Multitrack MusicVAE request failed in fallback router.',
  },
  'music.infill': {
    defaultsKey: 'infill',
    fallbackDefaults: { mode: 'accompany' },
    run: runMusicInfillService,
    done: 'Wrote AMT accompaniment parts via fallback router.',
    failed: 'AMT accompaniment request failed in fallback router.',
  },
} as const;

/** A specialist's payload: `override` over `base`, plus the score session infill falls back to. */
function specialistPayload(
  name: MidiSpecialistToolName,
  base: Record<string, unknown> | undefined,
  override: Record<string, unknown> | undefined,
  toolInput: ToolDefaultsLike | undefined,
): Record<string, unknown> {
  const payload = { ...(base || {}), ...(override || {}) };
  return name === 'music.infill' ? withInfillScoreSession(payload, toolInput) : payload;
}

/** The payload for an agent tool call: the configured tool defaults under the call's input. */
export function midiSpecialistToolPayload(
  name: MidiSpecialistToolName,
  input: Record<string, unknown>,
  toolInput: ToolDefaultsLike | undefined,
): Record<string, unknown> {
  return specialistPayload(name, toolInput?.[SPECIALISTS[name].defaultsKey], input, toolInput);
}

export function runMidiSpecialist(
  name: MidiSpecialistToolName,
  payload: Record<string, unknown>,
  traceContext?: TraceContext,
): Promise<ServiceResult> {
  const { run } = SPECIALISTS[name];
  return traceContext ? run(payload, { traceContext }) : run(payload);
}

/** The fallback router's run of a specialist (no LLM): defaults, run, envelope. */
export async function runMidiSpecialistFallback(
  name: MidiSpecialistToolName,
  toolInput: ToolDefaultsLike | undefined,
  traceContext?: TraceContext,
): Promise<ServiceResult> {
  const spec = SPECIALISTS[name];
  const payload = specialistPayload(
    name,
    spec.fallbackDefaults,
    toolInput?.[spec.defaultsKey],
    toolInput,
  );
  const result = await runMidiSpecialist(name, payload, traceContext);
  return {
    status: result.status,
    body: {
      mode: 'fallback',
      selectedTool: name,
      toolStatus: result.status,
      toolOk: result.status < 400,
      response: result.status < 400 ? spec.done : spec.failed,
      result: result.body,
    },
  };
}

export const MIDI_SPECIALIST_INSTRUCTIONS = [
  '- music_multitrack_vae: short multitrack (up to 8-track) General-MIDI ideas via Magenta MusicVAE — grooves, chord-conditioned measures, style morph/interpolation, or reconstruct/blend measures. Prefer this over music_generate for multitrack MIDI grooves, latent style interpolation, and chord-progression backing ideas.',
  '- music_infill: write new parts under a melody with the Anticipatory Music Transformer (mode "accompany"). Pass the score session (scoreSessionId) or MIDI, and melodyTrack / melodyTrackName for the melody part. Prefer this for "write/add an accompaniment" as notes; music_harmony_analyze is for chord symbols and MMA. Long scores are refused; suggest the Accompany (AMT) panel for a selected range.',
];
