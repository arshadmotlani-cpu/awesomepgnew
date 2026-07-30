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
          'inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fyh-accent/60',
          'disabled:pointer-events-none disabled:opacity-50',
          size === 'sm' && 'h-9 px-3 text-sm',
          size === 'md' && 'h-10 px-4 text-sm',
          size === 'lg' && 'h-11 px-5 text-base',
          variant === 'primary' &&
            'border border-fyh-moss/40 bg-fyh-forest text-fyh-text shadow-lg shadow-black/30 hover:bg-fyh-moss',
          variant === 'secondary' &&
            'border border-[color:var(--fyh-border-strong)] bg-[color:var(--fyh-bg-surface)] text-fyh-text hover:border-[color:var(--fyh-border-hover)] hover:bg-[color:var(--fyh-bg-elevated)]',
          variant === 'ghost' &&
            'font-medium text-fyh-text-secondary hover:bg-white/8 hover:text-fyh-text',
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
