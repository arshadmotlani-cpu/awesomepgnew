import { redirect } from 'next/navigation';
import { accountProfileHref } from '@/src/lib/accountNavigation';

export default async function KycPageRedirect(
  props: PageProps<'/account/kyc'>,
) {
  const sp = await props.searchParams;
  const booking = typeof sp.booking === 'string' ? sp.booking : undefined;
  const submitted = sp.submitted === '1';

  redirect(
    accountProfileHref('identity', {
      booking,
      submitted: submitted ? '1' : undefined,
    }),
  );
}
