import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../../lib/ui';

/**
 * `primary` is the one place a button wears the accent (DESIGN_LANGUAGE §4.2): the main action of
 * a surface. Everything else is neutral. `outline`, `secondary` and `ghost` are older names that
 * used to be blue; they now look like `neutral` and `quiet`, so existing call sites keep working.
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

// A secondary action in a panel: outlined, neutral, no accent.
const neutral =
  'border-line-control bg-surface text-ink hover:bg-surface-hover disabled:border-line disabled:bg-surface-sunken disabled:text-slate-400';
// Chrome that should not draw attention: neutral text, a wash on hover, no border.
const quiet =
  'border-transparent bg-transparent text-ink-muted hover:bg-surface-hover disabled:text-slate-300 disabled:hover:bg-transparent';

const variantClasses: Record<ButtonVariant, string> = {
  primary: `bg-accent text-on-accent border-accent hover:bg-accent-hover ${solidFocus} ${solidDisabled}`,
  danger: `bg-danger text-on-accent border-danger hover:bg-danger-hover ${solidFocus} ${solidDisabled}`,
  neutral,
  outline: neutral,
  secondary: neutral,
  destructive: `border-line-control bg-surface text-danger hover:bg-danger-soft disabled:border-line disabled:bg-surface-sunken disabled:text-slate-400`,
  quiet,
  ghost: quiet,
  // Reads as text inside a sentence.
  link: 'border-transparent bg-transparent text-accent underline hover:text-accent-hover disabled:text-slate-400',
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
