import { getInvitationByToken } from '@/src/platform/services/admin';
import { AcceptInviteForm } from './accept-invite-form';

type Props = { searchParams: Promise<{ token?: string }> };

export default async function AcceptPlatformInvitePage({ searchParams }: Props) {
  const { token = '' } = await searchParams;
  const invite = token ? await getInvitationByToken(token) : null;

  return (
    <div className="plt-root min-h-[100dvh]">
      <div className="mx-auto flex min-h-[100dvh] max-w-lg items-center px-4 py-10">
        <div className="plt-card w-full p-8 shadow-lg">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--plt-text-subtle)]">FYHAIR SaaS</p>
          <h1 className="mt-2 text-2xl font-semibold text-[var(--plt-text)]">Accept invitation</h1>
          {invite ? (
            <AcceptInviteForm
              token={token}
              email={invite.email}
              organizationName={invite.organizationName}
              accessRole={invite.accessRole}
            />
          ) : (
            <p className="mt-2 text-sm text-red-600">Invitation token is missing or invalid.</p>
          )}
        </div>
      </div>
    </div>
  );
}
