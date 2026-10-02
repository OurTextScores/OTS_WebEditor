import * as React from 'react';
import { cn } from '../../lib/ui';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

// Status colours carry meaning (DESIGN_LANGUAGE §4.3): use a tone for what the badge says, not for
// how it should look.
const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-surface-hover text-ink-muted',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-caption font-semibold leading-none',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
