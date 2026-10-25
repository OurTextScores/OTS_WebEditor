'use client';

import React from 'react';
import { Repeat } from 'lucide-react';
import { Button, type ButtonVariant } from '../ui/Button';
import { setPlayRepeats } from '../../lib/playback/playback-options-preferences';
import {
  usePlaybackOptionPreferences,
  usePlaybackOptionsStatus,
} from '../../lib/playback/use-playback-options';

/**
 * Written repeats on or off. This is the score's own repeat structure (repeat barlines, voltas, D.C./D.S.); it is not
 * looping. Off plays every written measure once, as desktop MuseScore does.
 */
export function PlayRepeatsToggle({
  className,
  pressedClassName,
  variant = 'outline',
  pressedVariant = 'primary',
  testId,
}: {
  className?: string;
  pressedClassName?: string;
  variant?: ButtonVariant;
  pressedVariant?: ButtonVariant;
  testId: string;
}) {
  const { playRepeats } = usePlaybackOptionPreferences();
  const status = usePlaybackOptionsStatus();
  const unavailable = status.capability === 'unavailable';
  return (
    <Button
      size="sm"
      variant={playRepeats ? pressedVariant : variant}
      data-testid={testId}
      className={`${className ?? ''} ${playRepeats ? (pressedClassName ?? '') : ''}`}
      aria-pressed={playRepeats}
      aria-label="Play repeats"
      disabled={unavailable}
      title={
        unavailable
          ? 'Repeat playback options are not available with this engine'
          : playRepeats
            ? 'Playing written repeats, voltas and jumps (click to play each measure once)'
            : 'Playing each written measure once (click to follow repeats)'
      }
      onClick={() => setPlayRepeats(!playRepeats)}
    >
      <Repeat size={14} aria-hidden="true" />
    </Button>
  );
}
