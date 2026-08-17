import * as React from 'react';
import { cn } from '@/src/hair/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-[var(--fyh-control-h)] min-h-[var(--fyh-control-h)] w-full rounded-[var(--fyh-radius)] border border-[color:var(--fyh-border-strong)] bg-[color-mix(in_srgb,var(--fyh-bg-surface)_88%,black)] px-3 text-[0.875rem] font-medium text-fyh-text',
          'max-md:min-h-[var(--fyh-control-h-mobile)]',
          'placeholder:text-fyh-text-muted placeholder:font-normal',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fyh-accent/40 focus-visible:border-[color:var(--fyh-border-hover)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'fyh-theme-light:bg-white/90',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
