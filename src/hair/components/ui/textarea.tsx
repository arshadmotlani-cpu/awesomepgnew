import * as React from 'react';
import { cn } from '@/src/hair/lib/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'fyh-textarea',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fyh-accent/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'fyh-theme-light:bg-white/80',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
