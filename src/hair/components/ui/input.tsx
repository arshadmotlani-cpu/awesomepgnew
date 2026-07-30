import * as React from 'react';
import { cn } from '@/src/hair/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-[var(--fyh-radius)] border border-[color:var(--fyh-border-strong)] bg-black/25 px-3.5 text-[0.875rem] font-medium text-fyh-text',
          'placeholder:text-fyh-text-muted placeholder:font-normal',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fyh-accent/50 focus-visible:border-[color:var(--fyh-border-hover)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'fyh-theme-light:bg-white/80',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
