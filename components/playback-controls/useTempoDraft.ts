import { useEffect, useRef, useState } from 'react';
import {
  clampTempoPercent,
  setTempoPercent,
} from '../../lib/playback/playback-options-preferences';

/** Keyboard steps settle for this long before they are applied, so holding an arrow key is one change. */
const KEYBOARD_COMMIT_MS = 300;

/**
 * Slider/number-field editing of the speed: moving previews the value, and only a release, Enter, blur or a short
 * pause after keyboard steps applies it (each application re-prepares audio at the same musical place).
 */
export function useTempoDraft(committed: number) {
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const commit = (value = draft) => {
    clear();
    setDraft(null);
    if (value !== null && clampTempoPercent(value) !== committed) setTempoPercent(value);
  };
  return {
    value: draft ?? committed,
    preview: (value: number) => setDraft(clampTempoPercent(value)),
    commit,
    /** Arrow/Page/Home/End on the slider: apply once the keys settle. */
    commitSoon: (value: number) => {
      setDraft(clampTempoPercent(value));
      clear();
      timer.current = setTimeout(() => commit(clampTempoPercent(value)), KEYBOARD_COMMIT_MS);
    },
    cancel: () => {
      clear();
      setDraft(null);
    },
  };
}
