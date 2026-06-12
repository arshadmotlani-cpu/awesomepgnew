type Props = {
  fullName: string;
  /** Latest KYC submission — selfie is shown as private profile photo. */
  kycSubmissionId: string | null;
};

function initialsFromName(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

/**
 * Profile photo from the KYC selfie. Served via the authenticated KYC document
 * API — visible only to the customer and admins, never on public pages.
 */
export function ProfilePhoto({ fullName, kycSubmissionId }: Props) {
  const initials = initialsFromName(fullName) || '?';

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-white/15 bg-zinc-800 shadow-md ring-2 ring-apg-orange/20">
        {kycSubmissionId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/kyc/documents/${kycSubmissionId}/selfie`}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center text-lg font-semibold text-apg-silver"
            aria-hidden
          >
            {initials}
          </span>
        )}
      </div>
      <p className="text-xs text-apg-muted">
        {kycSubmissionId
          ? 'Photo from your verification selfie — only you and Awesome PG admin can see it.'
          : 'Your profile photo appears here after you upload a selfie during identity verification.'}
      </p>
    </div>
  );
}
