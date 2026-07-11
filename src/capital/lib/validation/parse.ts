import type { ZodType } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldValues, Resolver } from 'react-hook-form';

export function zodErrorMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Validation failed';
}

export function capitalZodResolver<T extends FieldValues>(schema: ZodType<T>): Resolver<T> {
  return zodResolver(schema as never) as Resolver<T>;
}

export function parseZod<T>(schema: ZodType<T>, data: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) return { ok: false, error: zodErrorMessage(result.error) };
  return { ok: true, data: result.data };
}

export function formDataToObject(formData: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') obj[key] = value;
  }
  return obj;
}
