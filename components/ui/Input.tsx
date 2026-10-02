import * as React from 'react';
import { cn } from '../../lib/ui';

const fieldClasses =
  'w-full rounded border border-line-control bg-surface px-2 py-1 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-faint aria-[invalid=true]:border-danger';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => (
    <input ref={ref} type={type} className={cn(fieldClasses, className)} {...props} />
  ),
);
Input.displayName = 'Input';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldClasses, className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';
