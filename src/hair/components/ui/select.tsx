import * as React from 'react';
import { cn } from '@/src/hair/lib/utils';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'fyh-select',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fyh-accent/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'fyh-theme-light:bg-white/80',
        className,
      )}
      {...props}
    />
  ),
);
Select.displayName = 'Select';
