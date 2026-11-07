import { useState } from 'react';
import {
  readDisplay,
  readPlayThrough,
  readReflow,
  writePlayThrough,
  writeReflow,
  readHalfPages,
  writeDisplay,
  writeHalfPages,
  type PerformerDisplay,
} from '../platform/deviceSettings';

/** Half-page turns on or off, remembered per score and orientation (portrait and landscape choose separately). */
export function useHalfPages(scoreKey: string, orientation: string) {
  const [choice, setChoice] = useState<Record<string, boolean>>({});
  const halfPages = choice[orientation] ?? readHalfPages(scoreKey, orientation);
  const setHalfPages = (on: boolean) => {
    writeHalfPages(scoreKey, orientation, on);
    setChoice((previous) => ({ ...previous, [orientation]: on }));
  };
  return [halfPages, setHalfPages] as const;
}

/** How the page is shown (normal, high contrast, dark), remembered per device. */
export function useDisplay() {
  const [display, setDisplay] = useState(readDisplay);
  const choose = (next: PerformerDisplay) => {
    writeDisplay(next);
    setDisplay(next);
  };
  return [display, choose] as const;
}

/** Reflow for this screen (breaks ignored) or as engraved, remembered per score. */
export function useReflow(scoreKey: string) {
  const [reflow, setReflow] = useState(() => readReflow(scoreKey));
  const choose = (on: boolean) => {
    writeReflow(scoreKey, on);
    setReflow(on);
  };
  return [reflow, choose] as const;
}

/** The Play-through view (repeats written out) on or off, remembered per score. */
export function usePlayThrough(scoreKey: string) {
  const [playThrough, setPlayThrough] = useState(() => readPlayThrough(scoreKey));
  const choose = (on: boolean) => {
    writePlayThrough(scoreKey, on);
    setPlayThrough(on);
  };
  return [playThrough, choose] as const;
}
