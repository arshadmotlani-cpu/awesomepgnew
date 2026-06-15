import type { DevAssistantProvider, DevAssistantProviderId } from '@/src/lib/devAssistant/providers/types';
import { OpenAIDevAssistantProvider } from '@/src/lib/devAssistant/providers/openaiProvider';
import { StubDevAssistantProvider } from '@/src/lib/devAssistant/providers/stubProvider';

const providers: DevAssistantProvider[] = [
  new OpenAIDevAssistantProvider(),
  new StubDevAssistantProvider(),
];

export function getDevAssistantProvider(preferred?: DevAssistantProviderId): DevAssistantProvider {
  if (preferred) {
    const p = providers.find((x) => x.id === preferred);
    if (p?.isConfigured()) return p;
  }

  const configured = providers.find((p) => p.id !== 'stub' && p.isConfigured());
  return configured ?? new StubDevAssistantProvider();
}

export function listDevAssistantProviders(): Array<{ id: DevAssistantProviderId; configured: boolean }> {
  return providers.map((p) => ({ id: p.id, configured: p.isConfigured() }));
}
