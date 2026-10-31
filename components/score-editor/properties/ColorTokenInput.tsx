'use client';

import React, { useEffect, useRef } from 'react';

/**
 * A colour picker over a "#RRGGBBAA" token. Uncontrolled, it commits once, on the native `change` (the picker
 * closing): React's onChange is the `input` event, which fires for every move in the picker, and a controlled input
 * snaps back to the engine's value before `change` arrives. The picker has no alpha: it is kept, and a transparent
 * colour becomes opaque once one is chosen.
 */
export function ColorTokenInput({
  value,
  disabled,
  testId,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  testId: string;
  onCommit: (token: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const latest = useRef({ value, onCommit });
  useEffect(() => {
    latest.current = { value, onCommit };
  }, [value, onCommit]);
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const commit = () => {
      const alpha = latest.current.value.slice(7);
      const token = `${input.value.toUpperCase()}${alpha === '00' || !alpha ? 'FF' : alpha}`;
      if (token !== latest.current.value) latest.current.onCommit(token);
    };
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
    // The input remounts with each value (its key): attach to the new one.
  }, [value]);
  return (
    <input
      // Remount on a new engine value, so the picker shows it.
      key={value}
      ref={ref}
      type="color"
      data-testid={testId}
      className="h-7 w-12 rounded border border-slate-300 bg-white"
      defaultValue={value.slice(0, 7)}
      disabled={disabled}
    />
  );
}
