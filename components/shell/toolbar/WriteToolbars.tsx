'use client';

import React from 'react';
import { ToolStrip } from './strip/ToolStrip';
import { WriteToolbar } from './WriteToolbar';

/** Write mode's toolbar slot: one toolbar, the note-entry controls first and the rest of the ribbon's controls after them. */
export function WriteToolbars({ noteInputMethod }: { noteInputMethod?: number }) {
  return (
    <ToolStrip>
      <WriteToolbar noteInputMethod={noteInputMethod} />
    </ToolStrip>
  );
}
