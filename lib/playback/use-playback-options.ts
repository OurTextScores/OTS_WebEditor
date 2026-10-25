'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PlaybackOptions, PlaybackOptionsRequest, Score } from '../webmscore-loader';
import type { PlaybackOptionsChange } from './options-transaction';
import {
  adoptAcceptedOptions,
  getPlaybackOptionPreferences,
  getPlaybackOptionPreferencesOnServer,
  getPlaybackOptionsStatus,
  getPlaybackOptionsStatusOnServer,
  optionsMatch,
  subscribePlaybackOptions,
  toOptionsRequest,
  updatePlaybackOptionsStatus,
  type PlaybackOptionPreferences,
  type PlaybackOptionsStatus,
} from './playback-options-preferences';

/** Live views of the store; kept apart from it because the server-rendered help page imports the commands. */
export const usePlaybackOptionPreferences = (): PlaybackOptionPreferences =>
  useSyncExternalStore(
    subscribePlaybackOptions,
    getPlaybackOptionPreferences,
    getPlaybackOptionPreferencesOnServer,
  );
export const usePlaybackOptionsStatus = (): PlaybackOptionsStatus =>
  useSyncExternalStore(
    subscribePlaybackOptions,
    getPlaybackOptionsStatus,
    getPlaybackOptionsStatusOnServer,
  );

type OptionsTransport = {
  playbackOptions: PlaybackOptions | null;
  setPlaybackOptions: (request: PlaybackOptionsRequest) => Promise<PlaybackOptionsChange>;
};

/**
 * Keeps one transport's score playing at the remembered speed and repeat setting. Each new score asks the engine
 * whether it supports options (capability, not version); an unsupported engine leaves the controls unavailable. A
 * change goes through the transport's position-preserving transaction; a failed one reverts the controls to what the
 * engine still plays, so they never claim an option that is not sounding.
 */
export function usePlaybackOptionsSync({
  score,
  transport,
}: {
  score: Score | null;
  transport: OptionsTransport;
}) {
  const preferences = usePlaybackOptionPreferences();
  const transportRef = useRef(transport);
  useLayoutEffect(() => {
    transportRef.current = transport;
  });
  const [capability, setCapability] = useState<{ score: Score; available: boolean } | null>(null);
  const available = capability?.score === score && capability.available;

  useEffect(() => {
    if (!score) return;
    let current = true;
    void Promise.resolve(score.playbackCapabilities?.() ?? null)
      .catch(() => null)
      .then((caps) => {
        if (!current) return;
        const supported = Boolean(caps?.playbackOptions);
        setCapability({ score, available: supported });
        updatePlaybackOptionsStatus({ capability: supported ? 'available' : 'unavailable' });
      });
    return () => {
      current = false;
    };
  }, [score]);

  const { tempoPercent, playRepeats } = preferences;
  useEffect(() => {
    if (!score || !available) return;
    const wanted = { tempoPercent, playRepeats };
    if (optionsMatch(transportRef.current.playbackOptions, wanted)) return;
    let current = true;
    updatePlaybackOptionsStatus({ applying: true, error: null });
    void transportRef.current.setPlaybackOptions(toOptionsRequest(wanted)).then((change) => {
      if (!current) return;
      updatePlaybackOptionsStatus({
        applying: false,
        error:
          change.status === 'failed' ? 'Playback speed or repeats could not be changed.' : null,
      });
      if (change.status === 'failed' && change.accepted) adoptAcceptedOptions(change.accepted);
    });
    return () => {
      // A newer request (or score) takes over; it re-marks itself as applying if it needs to.
      current = false;
      updatePlaybackOptionsStatus({ applying: false });
    };
  }, [available, playRepeats, score, tempoPercent]);
}
