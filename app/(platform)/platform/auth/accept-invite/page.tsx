import { getInvitationByToken } from '@/src/platform/services/admin';
import { AcceptInviteForm } from './accept-invite-form';

type Props = { searchParams: Promise<{ token?: string }> };

export default async function AcceptPlatformInvitePage({ searchParams }: Props) {
  const { token = '' } = await searchParams;
  const invite = token ? await getInvitationByToken(token) : null;

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-[100dvh] max-w-lg items-center px-4 py-10">
        <div className="w-full rounded-3xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl shadow-black/20">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">FYHAIR SaaS</p>
          <h1 className="mt-2 text-2xl font-semibold">Accept invitation</h1>
          {invite ? (
            <AcceptInviteForm
              token={token}
              email={invite.email}
              organizationName={invite.organizationName}
              accessRole={invite.accessRole}
            />
          ) : (
            <p className="mt-2 text-sm text-rose-300">Invitation token is missing or invalid.</p>
          )}
        </div>
      </div>
    </div>
  );
}
