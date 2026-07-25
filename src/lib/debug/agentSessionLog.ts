import { appendFileSync } from 'node:fs';

const DEBUG_LOG_PATH = '/Users/aashumotlani/awesomepg/.cursor/debug-b2af77.log';
const SESSION_ID = 'b2af77';

export function agentSessionLog(input: {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  runId?: string;
}) {
  const payload = {
    sessionId: SESSION_ID,
    timestamp: Date.now(),
    ...input,
  };
  try {
    appendFileSync(DEBUG_LOG_PATH, `${JSON.stringify(payload)}\n`);
  } catch {
    // ignore local log write failures (e.g. serverless)
  }
  console.error('[debug-b2af77]', JSON.stringify(payload));
}
