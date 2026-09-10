import React from 'react';

// Voltas have no SMuFL glyph, so draw MuseScore's prima/seconda-volta bracket
// (a hooked line with the ending number) as a small inline icon. The number
// comes from the ending value (1st ending, 2nd ending, …).

export const VoltaIcon: React.FC<{ value: number; className?: string }> = ({
  value,
  className,
}) => (
  <svg viewBox="0 0 34 20" width="30" height="18" className={className} aria-hidden="true">
    {/* Left hook down, across the top — the open volta bracket. */}
    <path
      d="M 3 18 L 3 4 L 31 4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <text
      x={6}
      y={16}
      fontSize={11}
      fontWeight={600}
      fill="currentColor"
      style={{ fontFamily: 'inherit' }}
    >{`${value}.`}</text>
  </svg>
);
