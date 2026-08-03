export type LoginBootstrap = {
  email?: string;
  message?: string;
};

/**
 * Plain /login must never depend on signup_sessions DB — missing migration must not brick login.
 * Signup cookie clears run in middleware (RSC cannot mutate cookies).
 * On /login?signup=1, cookies are preserved so mid-signup can continue.
 */
export async function bootstrapLoginPage(options?: {
  preserveSignup?: boolean;
}): Promise<LoginBootstrap> {
  void options;
  return {};
}
