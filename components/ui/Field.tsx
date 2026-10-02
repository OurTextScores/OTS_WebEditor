import * as React from 'react';
import { cn } from '../../lib/ui';

export interface FieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
}

export interface FieldProps {
  label: string;
  /** Helper text under the control. */
  hint?: string;
  /** Replaces the hint and marks the control invalid. */
  error?: string;
  className?: string;
  /** Receives the props that tie the control to its label, hint and error. */
  children: (control: FieldControlProps) => React.ReactNode;
}

/** A label, a control, and its hint or error, wired together for assistive technology. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = React.useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs font-medium text-ink">
        {label}
      </label>
      {children({
        id,
        'aria-describedby': message ? messageId : undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {message ? (
        <p
          id={messageId}
          role={error ? 'alert' : undefined}
          className={cn('text-caption', error ? 'text-danger' : 'text-ink-muted')}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
