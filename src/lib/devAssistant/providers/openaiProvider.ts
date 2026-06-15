import type {
  DevAssistantCompletionInput,
  DevAssistantCompletionResult,
  DevAssistantProvider,
} from '@/src/lib/devAssistant/providers/types';
import { formatDebugContextForPrompt } from '@/src/lib/devAssistant/contextBuilder';

const SYSTEM_PROMPT = `You are the Awesome PG internal AI Developer Assistant embedded in the admin panel.
You help the operator debug bugs, fix UI issues, improve workflows, and plan features while they test the site.
Be concise, actionable, and specific. Reference the auto-collected debug context.
Suggest exact files, routes, or admin pages when relevant.`;

export class OpenAIDevAssistantProvider implements DevAssistantProvider {
  id = 'openai' as const;

  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY?.trim());
  }

  async complete(input: DevAssistantCompletionInput): Promise<DevAssistantCompletionResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');

    const model = process.env.OPENAI_DEV_ASSISTANT_MODEL?.trim() || 'gpt-4o-mini';
    const contextBlock = input.enrichedContextBlock ?? formatDebugContextForPrompt(input.context);
    const system = [input.systemPromptExtra ?? SYSTEM_PROMPT, contextBlock].filter(Boolean).join('\n\n');

    const apiMessages: Array<{ role: string; content: unknown }> = [
      { role: 'system', content: system },
      ...input.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    if (input.screenshotDataUrl?.startsWith('data:image')) {
      const lastIdx = apiMessages.length - 1;
      const last = apiMessages[lastIdx];
      if (last && last.role === 'user') {
        apiMessages[lastIdx] = {
          role: 'user',
          content: [
            { type: 'text', text: String(last.content) },
            { type: 'image_url', image_url: { url: input.screenshotDataUrl, detail: 'low' } },
          ],
        };
      }
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        max_tokens: 1500,
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenAI error ${res.status}: ${errText.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content =
      json.choices?.[0]?.message?.content?.trim() ||
      'No response from OpenAI. Try again or check your API key.';

    return { content, provider: 'openai', model };
  }
}
