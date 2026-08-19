import { updatePlatformUserAction } from '@/src/platform/actions/admin';
import { PlatformAdminShell } from '@/src/platform/components/PlatformAdminShell';
import { listPlatformUsers } from '@/src/platform/services/admin';

export default async function PlatformUsersPage() {
  const users = await listPlatformUsers();

  return (
    <PlatformAdminShell title="Platform users" subtitle="Review SaaS users and platform-admin access.">
      <div className="space-y-4">
        {users.map((user) => (
          <form
            key={user.id}
            action={updatePlatformUserAction}
            className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6"
          >
            <input type="hidden" name="userId" value={user.id} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-white">{user.email}</p>
                <p className="text-xs text-slate-500">{user.id}</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="isPlatformAdmin"
                  defaultChecked={user.isPlatformAdmin}
                />
                Platform admin
              </label>
            </div>
            <div className="mt-4 flex items-end gap-4">
              <label className="grid gap-2 text-sm">
                <span>Status</span>
                <select
                  name="status"
                  defaultValue={user.status}
                  className="rounded-lg bg-slate-950 px-3 py-2"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="invited">Invited</option>
                </select>
              </label>
              <button
                type="submit"
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Save user
              </button>
            </div>
          </form>
        ))}
      </div>
    </PlatformAdminShell>
  );
}
