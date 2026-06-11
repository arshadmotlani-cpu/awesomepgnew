import { explainUiWithGpt } from '@/src/lib/cockroach/explainUi';
import type { CockroachExplainRequest } from '@/src/lib/cockroach/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidBody(body: unknown): body is CockroachExplainRequest {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.pageContext === 'object' &&
    b.pageContext !== null &&
    typeof b.elementContext === 'object' &&
    b.elementContext !== null
  );
}

export async function POST(req: Request) {
  if (process.env.COCKROACH_AI_ENABLED === 'false') {
    return Response.json({ error: 'Cockroach AI is disabled' }, { status: 503 });
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return Response.json({ error: 'OpenAI is not configured' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isValidBody(body)) {
    return Response.json({ error: 'Missing pageContext or elementContext' }, { status: 400 });
  }

  try {
    const result = await explainUiWithGpt(body);
    return Response.json(result);
  } catch (err) {
    console.error('[cockroach-explain]', err);
    return Response.json({ error: 'AI failed' }, { status: 500 });
  }
}
