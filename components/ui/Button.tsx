import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../../lib/ui';

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
  'inline-flex items-center justify-center rounded border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed';

const solidDisabled = 'disabled:bg-slate-200 disabled:text-slate-700 disabled:border-slate-300';
const solidFocus = 'focus-visible:ring-offset-2';

const variantClasses: Record<ButtonVariant, string> = {
  primary: `bg-blue-600 text-white border-blue-600 hover:bg-blue-700 ${solidFocus} ${solidDisabled}`,
  secondary: `bg-blue-600 text-white border-blue-600 hover:bg-blue-700 ${solidFocus} ${solidDisabled}`,
  outline: `bg-white text-blue-700 border-blue-600 hover:bg-blue-50 ${solidFocus} ${solidDisabled}`,
  ghost: `bg-transparent text-blue-700 border-transparent hover:bg-blue-50 ${solidFocus} ${solidDisabled}`,
  danger: `bg-red-600 text-white border-red-600 hover:bg-red-700 ${solidFocus} ${solidDisabled}`,
  // A secondary action in a panel: outlined, neutral, no accent.
  neutral: `border-line-control bg-surface text-ink hover:bg-surface-hover disabled:border-line disabled:bg-surface-sunken disabled:text-slate-400`,
  // The same, for an action that deletes something.
  destructive: `border-line-control bg-surface text-danger hover:bg-danger-soft disabled:border-line disabled:bg-surface-sunken disabled:text-slate-400`,
  // Reads as text inside a sentence.
  link: 'border-transparent bg-transparent text-accent underline hover:text-accent-hover disabled:text-slate-400',
  // Chrome that should not draw attention: neutral text, a wash on hover, no border.
  quiet:
    'border-transparent bg-transparent text-ink-muted hover:bg-surface-hover disabled:text-slate-300 disabled:hover:bg-transparent',
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
