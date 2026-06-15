/** Debug context auto-collected from the admin panel before each message. */
export type DevAssistantDebugContext = {
  url: string;
  pathname: string;
  pageName: string;
  pageTitle: string;
  admin: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
  entity: {
    pgId?: string;
    pgName?: string;
    residentId?: string;
    residentName?: string;
    bedId?: string;
    bedCode?: string;
    roomId?: string;
    roomNumber?: string;
    bookingId?: string;
  };
  filters: Record<string, string>;
  searchQuery?: string;
  browser: {
    userAgent: string;
    language: string;
    platform: string;
  };
  viewport: {
    width: number;
    height: number;
    deviceType: 'mobile' | 'tablet' | 'desktop';
  };
  timestamp: string;
  recentErrors: DevAssistantCapturedError[];
  recentFailedRequests: DevAssistantFailedRequest[];
  sentry?: {
    lastEventId: string | null;
    recentEvents: Array<{ eventId: string; message?: string; route?: string }>;
  };
  pageHints?: Record<string, unknown>;
};

export type DevAssistantCapturedError = {
  message: string;
  source?: string;
  stack?: string;
  type: 'console' | 'unhandled' | 'react' | 'api' | 'network';
  at: string;
};

export type DevAssistantFailedRequest = {
  url: string;
  method: string;
  status: number;
  statusText?: string;
  at: string;
  bodySnippet?: string;
};

export type DevAssistantChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  screenshotDataUrl?: string | null;
};

export type DevAssistantConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  group: 'today' | 'yesterday' | 'older';
};
