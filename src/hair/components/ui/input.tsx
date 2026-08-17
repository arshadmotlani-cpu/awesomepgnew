import * as React from 'react';
import { cn } from '@/src/hair/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-[var(--fyh-control-h)] min-h-[var(--fyh-control-h)] w-full rounded-[var(--fyh-radius)] border border-[color:var(--fyh-input-border)] bg-[color:var(--fyh-input-bg)] px-3 text-[0.875rem] font-medium text-fyh-text',
          'max-md:min-h-[var(--fyh-control-h-mobile)]',
          'placeholder:text-[color:var(--fyh-input-placeholder)] placeholder:font-normal',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fyh-accent/45 focus-visible:border-[color:var(--fyh-border-hover)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'fyh-theme-light:bg-white',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
