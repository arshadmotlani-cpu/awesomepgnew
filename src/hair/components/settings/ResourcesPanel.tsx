'use client';

import { useActionState } from 'react';
import {
  createResourceAction,
  toggleResourceActiveAction,
  type ResourceActionState,
} from '@/src/hair/actions/resources';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { FyhResource } from '@/src/hair/db/schema';

const initial: ResourceActionState = {};

export function ResourcesPanel({ resources }: { resources: FyhResource[] }) {
  const [state, formAction, pending] = useActionState(createResourceAction, initial);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Chairs & resources</h2>
        <p className="text-sm text-fyh-text-secondary">
          Used on the appointment calendar. Inactive resources stay in history but hide from booking.
        </p>
      </div>

      <form action={formAction} className="fyh-glass grid gap-3 p-4 sm:grid-cols-4">
        <div className="space-y-1 sm:col-span-2">
          <label className="fyh-label" htmlFor="resourceName">
            Name *
          </label>
          <Input id="resourceName" name="name" required placeholder="Chair 1" />
        </div>
        <div className="space-y-1">
          <label className="fyh-label" htmlFor="resourceType">
            Type
          </label>
          <select
            id="resourceType"
            name="type"
            className="h-10 w-full rounded-md border border-[color:var(--fyh-border)] bg-black/30 px-3 text-sm"
            defaultValue="chair"
          >
            <option value="chair">Chair</option>
            <option value="vip_chair">VIP chair</option>
            <option value="wash_station">Wash station</option>
            <option value="makeup_room">Makeup room</option>
            <option value="facial_room">Facial room</option>
            <option value="nail_station">Nail station</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="fyh-label" htmlFor="resourceColor">
            Color
          </label>
          <Input id="resourceColor" name="color" placeholder="#c4a574 optional" />
        </div>
        <div className="sm:col-span-4">
          {state.error ? <p className="mb-2 text-sm text-fyh-danger">{state.error}</p> : null}
          {state.success ? <p className="mb-2 text-sm text-fyh-success">{state.success}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Add resource'}
          </Button>
        </div>
      </form>

      <ul className="fyh-glass divide-y divide-[color:var(--fyh-border)]">
        {resources.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-fyh-text-muted">No resources yet.</li>
        ) : (
          resources.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-fyh-text-muted capitalize">{r.type}</p>
              </div>
              <form action={toggleResourceActiveAction}>
                <input type="hidden" name="resourceId" value={r.id} />
                <input type="hidden" name="isActive" value={r.isActive ? '0' : '1'} />
                <Button type="submit" variant="secondary" size="sm">
                  {r.isActive ? 'Archive' : 'Restore'}
                </Button>
              </form>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
