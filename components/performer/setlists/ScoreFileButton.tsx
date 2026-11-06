'use client';

import React, { useRef } from 'react';
import { Button } from '../../ui/Button';
import { SCORE_FILE_ACCEPT } from '../platform/scoreFiles';

/** A button that opens the file picker for a score file (the editor's formats). */
export function ScoreFileButton({
  label,
  testId,
  variant,
  onFile,
}: {
  label: string;
  testId: string;
  variant?: 'primary' | 'outline';
  onFile: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={variant}
        data-testid={testId}
        onClick={() => input.current?.click()}
      >
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        accept={SCORE_FILE_ACCEPT}
        hidden
        data-testid={`${testId}-input`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onFile(file);
        }}
      />
    </>
  );
}
