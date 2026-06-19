/** Structured auth funnel logs — safe for production (no secrets). */
export type AuthLogEvent =
  | 'signup_session_created'
  | 'signup_session_resumed'
  | 'otp_verified'
  | 'profile_saved'
  | 'password_committed'
  | 'duplicate_submission_blocked';

type AuthLogPayload = {
  email?: string;
  sessionId?: string;
  step?: string;
  source?: string;
  reason?: string;
};

export function authLog(event: AuthLogEvent, payload: AuthLogPayload = {}): void {
  console.info('[auth]', JSON.stringify({ event, ...payload, ts: new Date().toISOString() }));
}
