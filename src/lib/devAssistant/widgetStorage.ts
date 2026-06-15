const UI_KEY = 'apg-dev-assistant-ui';

export type DevAssistantUiState = {
  minimized: boolean;
  open: boolean;
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  conversationId: string | null;
  mode: 'ask' | 'plan' | 'agent';
  panel: 'workspace' | 'tasks' | 'history';
};

const DEFAULT: DevAssistantUiState = {
  minimized: false,
  open: false,
  width: 480,
  height: 640,
  x: null,
  y: null,
  conversationId: null,
  mode: 'ask',
  panel: 'workspace',
};

export function loadDevAssistantUiState(): DevAssistantUiState {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...(JSON.parse(raw) as Partial<DevAssistantUiState>) };
  } catch {
    return DEFAULT;
  }
}

export function saveDevAssistantUiState(partial: Partial<DevAssistantUiState>) {
  if (typeof window === 'undefined') return;
  try {
    const next = { ...loadDevAssistantUiState(), ...partial };
    localStorage.setItem(UI_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

const DRAFT_KEY = 'apg-dev-assistant-draft';

export function saveDevAssistantDraft(conversationId: string | null, text: string) {
  if (typeof window === 'undefined') return;
  try {
    const key = conversationId ?? '__new__';
    const raw = localStorage.getItem(DRAFT_KEY);
    const drafts = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    if (text.trim()) drafts[key] = text;
    else delete drafts[key];
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  } catch {
    /* ignore quota */
  }
}

export function loadDevAssistantDraft(conversationId: string | null): string {
  if (typeof window === 'undefined') return '';
  try {
    const key = conversationId ?? '__new__';
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return '';
    const drafts = JSON.parse(raw) as Record<string, string>;
    return drafts[key] ?? '';
  } catch {
    return '';
  }
}
