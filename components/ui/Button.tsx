import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../../lib/ui';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'xs' | 'sm' | 'md';

const baseClasses =
    'inline-flex items-center justify-center rounded border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-700 disabled:border-slate-300 disabled:opacity-100';

const variantClasses: Record<ButtonVariant, string> = {
    primary: 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700',
    secondary: 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700',
    outline: 'bg-white text-blue-700 border-blue-600 hover:bg-blue-50',
    ghost: 'bg-transparent text-blue-700 border-transparent hover:bg-blue-50',
    danger: 'bg-red-600 text-white border-red-600 hover:bg-red-700',
};

const sizeClasses: Record<ButtonSize, string> = {
    xs: 'px-2 py-0.5 text-[11px] sm:text-xs',
    sm: 'px-2 py-1 text-xs sm:text-sm',
    md: 'px-3 py-2 text-sm',
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
