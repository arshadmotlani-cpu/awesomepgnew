import * as React from 'react';
import { cn } from '@/src/hair/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-[var(--fyh-radius)] border border-[color:var(--fyh-border-strong)] bg-black/20 px-3 text-[0.8125rem] text-fyh-text',
          'placeholder:text-fyh-text-muted',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fyh-accent/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'fyh-theme-light:bg-white/70',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
