import type { DevAssistantDebugContext, DevAssistantMode } from '@/src/lib/devAssistant/types';

export type DevAssistantProviderId = 'openai' | 'stub' | 'anthropic' | 'gemini' | 'cursor';

export type DevAssistantProviderMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type DevAssistantCompletionInput = {
  messages: DevAssistantProviderMessage[];
  context: DevAssistantDebugContext;
  screenshotDataUrl?: string | null;
  mode?: DevAssistantMode;
  systemPromptExtra?: string;
  enrichedContextBlock?: string;
};

export type DevAssistantCompletionResult = {
  content: string;
  provider: DevAssistantProviderId;
  model?: string;
};

export interface DevAssistantProvider {
  id: DevAssistantProviderId;
  isConfigured(): boolean;
  complete(input: DevAssistantCompletionInput): Promise<DevAssistantCompletionResult>;
}
