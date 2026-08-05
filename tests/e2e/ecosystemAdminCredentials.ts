import { ECOSYSTEM_ADMIN_EMAIL } from '@/src/lib/auth/ecosystemAdmin';

export const ECOSYSTEM_ADMIN_EMAIL_EXPORT = ECOSYSTEM_ADMIN_EMAIL;

export function resolveEcosystemAdminCredentials(): {
  email: string;
  password: string | null;
} {
  const email =
    process.env.E2E_ADMIN_EMAIL?.trim().toLowerCase() ||
    process.env.ECOSYSTEM_ADMIN_EMAIL?.trim().toLowerCase() ||
    ECOSYSTEM_ADMIN_EMAIL;
  const password =
    process.env.E2E_ADMIN_PASSWORD?.trim() ||
    process.env.ECOSYSTEM_ADMIN_PASSWORD?.trim() ||
    null;
  return { email, password };
}
