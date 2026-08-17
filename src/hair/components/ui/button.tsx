import * as React from 'react';
import { cn } from '@/src/hair/lib/utils';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-[var(--fyh-radius)] font-semibold transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fyh-accent/50',
          'disabled:pointer-events-none disabled:opacity-50',
          'max-md:min-h-[var(--fyh-control-h-mobile)]',
          size === 'sm' && 'h-8 min-h-8 px-2.5 text-xs md:h-9 md:min-h-9',
          size === 'md' &&
            'h-[var(--fyh-control-h)] min-h-[var(--fyh-control-h)] px-3.5 text-sm',
          size === 'lg' &&
            'h-10 min-h-10 px-4 text-sm md:h-[2.625rem] md:min-h-[2.625rem]',
          variant === 'primary' &&
            'border border-[color:color-mix(in_srgb,var(--fyh-accent)_70%,white)] bg-fyh-accent text-[#041018] shadow-md shadow-cyan-500/20 hover:bg-fyh-accent-soft',
          variant === 'secondary' &&
            'border border-[color:var(--fyh-border-strong)] bg-[color:var(--fyh-bg-surface)] text-fyh-text hover:border-[color:var(--fyh-border-hover)] hover:bg-[color:var(--fyh-bg-elevated)]',
          variant === 'ghost' &&
            'font-medium text-fyh-text-label hover:bg-white/8 hover:text-fyh-text',
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
