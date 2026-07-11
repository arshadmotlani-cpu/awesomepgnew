'use client';

import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { Label } from '@/src/capital/components/ui/label';
import { cn } from '@/src/capital/lib/utils';

export function FormField<T extends FieldValues>({
  label,
  name,
  form,
  children,
  className,
}: {
  label: string;
  name: Path<T>;
  form: UseFormReturn<T>;
  children: React.ReactNode;
  className?: string;
}) {
  const error = form.formState.errors[name]?.message as string | undefined;
  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={String(name)}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-ac-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
