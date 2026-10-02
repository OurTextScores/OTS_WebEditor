import * as React from 'react';
import { Button, type ButtonProps } from './Button';

export interface IconButtonProps extends Omit<ButtonProps, 'aria-label' | 'children'> {
  /** The accessible name. An icon has no text, so this is required, and it is the default tooltip. */
  label: string;
  children: React.ReactNode;
}

/** A quiet, icon-only button. Pass a longer `title` to describe it beyond its name. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, title, variant = 'quiet', size = 'bar', className, children, ...props }, ref) => (
    <Button
      ref={ref}
      aria-label={label}
      title={title ?? label}
      variant={variant}
      size={size}
      className={className}
      {...props}
    >
      {children}
    </Button>
  ),
);

IconButton.displayName = 'IconButton';
