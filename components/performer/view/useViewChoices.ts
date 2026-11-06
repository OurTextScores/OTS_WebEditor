import { useState } from 'react';
import {
  readDisplay,
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
