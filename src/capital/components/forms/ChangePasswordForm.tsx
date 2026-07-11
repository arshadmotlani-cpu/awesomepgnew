'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { capitalZodResolver } from '@/src/capital/lib/validation/parse';
import { changePasswordAction, type ActionState } from '@/src/capital/actions/settings';
import { Button } from '@/src/capital/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { Input } from '@/src/capital/components/ui/input';
import { FormField } from '@/src/capital/components/forms/FormField';
import { useCapitalToast } from '@/src/capital/components/CapitalToastProvider';
import { changePasswordSchema } from '@/src/capital/lib/validation/schemas';
import type { z } from 'zod';

type PasswordInput = z.infer<typeof changePasswordSchema>;

export function ChangePasswordForm() {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const { showToast } = useCapitalToast();

  const form = useForm<PasswordInput>({
    resolver: capitalZodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit((values) => {
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => fd.set(k, v));
    startTransition(async () => {
      const result = await changePasswordAction(state, fd);
      if (result.error) {
        setState({ error: result.error });
        showToast(result.error);
      } else {
        setState({ success: result.success });
        showToast('Password changed');
        form.reset();
      }
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormField label="Current password" name="currentPassword" form={form}>
            <Input id="currentPassword" type="password" autoComplete="current-password" {...form.register('currentPassword')} />
          </FormField>
          <FormField label="New password" name="newPassword" form={form}>
            <Input id="newPassword" type="password" autoComplete="new-password" {...form.register('newPassword')} />
          </FormField>
          <FormField label="Confirm password" name="confirmPassword" form={form}>
            <Input id="confirmPassword" type="password" autoComplete="new-password" {...form.register('confirmPassword')} />
          </FormField>
          {state.error ? <p className="text-sm text-ac-danger">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-ac-success">{state.success}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
