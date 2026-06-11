import {
  formatElementContextForPrompt,
  formatPageContextForPrompt,
} from '@/src/lib/cockroach/pageContextBuilder';
import type {
  CockroachExplainRequest,
  CockroachExplainResponse,
  UserStage,
} from '@/src/lib/cockroach/types';

const VALID_STAGES: ReadonlySet<UserStage> = new Set([
  'first_time_user',
  'browsing_pgs',
  'booking_flow',
  'resident_dashboard',
]);

function cockroachModel(): string {
  return process.env.COCKROACH_AI_MODEL?.trim() || 'gpt-4.1-mini';
}

function buildPrompt(body: CockroachExplainRequest): string {
  const userStage = VALID_STAGES.has(body.userStage as UserStage)
    ? body.userStage
    : 'first_time_user';

  return `
You are Roachie, a friendly cockroach mascot who helps people use Awesome PG (a website to browse and book PG beds in India).

RULES:
- Explain like a kind teacher talking to a young student
- Use very simple words and short sentences (1–3 sentences max)
- No technical jargon, no code, no backend talk
- Focus only on what the user sees and what they should do next
- Be warm and helpful, not wordy
- If the page is about booking a bed, mention move-in and that they can stay long-term with notice to leave

USER CONTEXT:
${userStage}

PAGE CONTEXT:
${formatPageContextForPrompt(body.pageContext)}

ELEMENT CONTEXT (what to explain right now):
${formatElementContextForPrompt(body.elementContext)}

Explain this UI part in a simple, friendly way:
`.trim();
}

export async function explainUiWithGpt(
  body: CockroachExplainRequest,
): Promise<CockroachExplainResponse> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model: cockroachModel(),
    messages: [{ role: 'user', content: buildPrompt(body) }],
    temperature: 0.6,
    max_tokens: 180,
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('Empty response from OpenAI');
  }

  return { text };
}
