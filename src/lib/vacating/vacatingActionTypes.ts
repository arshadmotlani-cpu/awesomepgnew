/** Shared vacating admin action state — keep out of `'use server'` files. */
export type VacatingActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };
