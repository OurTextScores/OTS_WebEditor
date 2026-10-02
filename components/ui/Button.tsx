import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../../lib/ui';

/**
 * The accent (blue) marks a button's weight: `primary` is solid, `outline` (the default) is the
 * blue-outlined secondary action, `ghost` is blue text. `neutral` and `quiet` are the grey
 * options for panel-internal actions and chrome. Decision 2026-10-02: the default stays blue, so a
 * dialog's Cancel is still distinct from a neutral surface.
 */
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'neutral'
  | 'destructive'
  | 'quiet'
  | 'link';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'bar' | 'text';

// Disabled and focus-offset looks live in the variants, not here: two utilities that set the same
// property are resolved by the order Tailwind emits them in, not by the order in the class string.
const baseClasses =
  'inline-flex items-center justify-center rounded border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed';

const solidDisabled = 'disabled:bg-slate-200 disabled:text-slate-700 disabled:border-slate-300';
const solidFocus = 'focus-visible:ring-offset-2';

// An action inside a panel that should not compete with the blue ones: outlined, grey.
const neutral =
  'border-line-control bg-surface text-ink hover:bg-surface-hover disabled:border-line disabled:bg-surface-sunken disabled:text-slate-500';
// Chrome that should not draw attention: dark text, a wash on hover, no border.
const quiet =
  'border-transparent bg-transparent text-ink hover:bg-surface-hover disabled:text-slate-500 disabled:hover:bg-transparent';

const variantClasses: Record<ButtonVariant, string> = {
  primary: `bg-accent text-on-accent border-accent hover:bg-accent-hover ${solidFocus} ${solidDisabled}`,
  danger: `bg-danger text-on-accent border-danger hover:bg-danger-hover ${solidFocus} ${solidDisabled}`,
  neutral,
  secondary: `bg-accent text-on-accent border-accent hover:bg-accent-hover ${solidFocus} ${solidDisabled}`,
  outline: `bg-surface text-accent border-accent hover:bg-accent-soft ${solidFocus} ${solidDisabled}`,
  ghost: `bg-transparent text-accent border-transparent hover:bg-accent-soft ${solidFocus} ${solidDisabled}`,
  destructive: `border-line-control bg-surface text-danger hover:bg-danger-soft disabled:border-line disabled:bg-surface-sunken disabled:text-slate-500`,
  quiet,
  // Reads as text inside a sentence.
  link: 'border-transparent bg-transparent text-accent underline hover:text-accent-hover disabled:text-slate-500',
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'px-2 py-0.5 text-caption',
  sm: 'px-2.5 py-0.5 text-xs',
  md: 'px-3 py-1.5 text-sm',
  // Status bar and panel headers: a fixed 24px row.
  bar: 'h-6 min-w-6 px-1.5 text-xs',
  // Inline with the surrounding text: no padding, the size of the sentence it sits in.
  text: '',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild, className, variant = 'outline', size = 'sm', type, ...props }, ref) => {
    const Component = asChild ? Slot : 'button';
    return (
      <Component
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';
