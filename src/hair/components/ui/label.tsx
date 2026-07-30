import * as React from 'react';
import { cn } from '@/src/hair/lib/utils';

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn('fyh-label block', className)} {...props} />
  ),
);
Label.displayName = 'Label';
