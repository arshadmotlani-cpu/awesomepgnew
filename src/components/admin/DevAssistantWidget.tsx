'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import type { DevAssistantChatMessage, DevAssistantConversationSummary } from '@/src/lib/devAssistant/types';
import { collectDevAssistantContext } from '@/src/lib/devAssistant/collectContext';
import { formatDebugContextForClipboard } from '@/src/lib/devAssistant/contextBuilder';
import {
  loadDevAssistantUiState,
  saveDevAssistantUiState,
} from '@/src/lib/devAssistant/widgetStorage';
import { installDevAssistantErrorCollector } from '@/src/lib/devAssistant/errorCollector';
import { trackNavigation } from '@/src/lib/devAssistant/recentActions';

export type DevAssistantWidgetProps = {
  admin: { id: string; email: string; fullName: string; role: string };
};

async function captureScreenshot(): Promise<string | null> {
  try {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(document.body, {
      useCORS: true,
      logging: false,
      scale: Math.min(window.devicePixelRatio, 1.5),
      ignoreElements: (el) => el.classList?.contains('apg-dev-assistant-root'),
    });
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return null;
  }
}

function groupLabel(group: DevAssistantConversationSummary['group']) {
  if (group === 'today') return 'Today';
  if (group === 'yesterday') return 'Yesterday';
  return 'Previous';
}

export function DevAssistantWidget({ admin }: DevAssistantWidgetProps) {
  const [ui, setUi] = useState(loadDevAssistantUiState);
  const [messages, setMessages] = useState<DevAssistantChatMessage[]>([]);
  const [conversations, setConversations] = useState<DevAssistantConversationSummary[]>([]);
  const [input, setInput] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [providerInfo, setProviderInfo] = useState<string>('stub');
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    installDevAssistantErrorCollector();
  }, []);

  useEffect(() => {
    trackNavigation(pathname);
  }, [pathname]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const persistUi = useCallback((partial: Partial<typeof ui>) => {
    setUi((prev) => {
      const next = { ...prev, ...partial };
      saveDevAssistantUiState(next);
      return next;
    });
  }, []);

  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/admin/dev-assistant/conversations');
    if (!res.ok) return;
    const json = (await res.json()) as {
      ok: boolean;
      data?: {
        conversations: DevAssistantConversationSummary[];
        providers: Array<{ id: string; configured: boolean }>;
      };
    };
    if (json.ok && json.data) {
      setConversations(json.data.conversations);
      const active = json.data.providers.find((p) => p.configured && p.id !== 'stub');
      setProviderInfo(active?.id ?? 'stub (add OPENAI_API_KEY)');
    }
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/dev-assistant/conversations/${id}`);
    if (!res.ok) return;
    const json = (await res.json()) as {
      ok: boolean;
      data?: { messages: DevAssistantChatMessage[] };
    };
    if (json.ok && json.data) {
      setMessages(json.data.messages);
      persistUi({ conversationId: id });
    }
  }, [persistUi]);

  useEffect(() => {
    void loadConversations();
    if (ui.conversationId) void loadConversation(ui.conversationId);
  }, [loadConversations, loadConversation, ui.conversationId]);

  const sendMessage = async (text: string) => {
    const content = text.trim();
    if (!content || loading) return;

    const context = collectDevAssistantContext(admin);
    const userMsg: DevAssistantChatMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
      screenshotDataUrl: screenshot,
    };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin/dev-assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          conversationId: ui.conversationId,
          context,
          screenshotDataUrl: screenshot,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        data?: {
          conversationId: string;
          assistantMessage: DevAssistantChatMessage;
          provider: string;
        };
      };
      if (!json.ok || !json.data) {
        setMessages((m) => [
          ...m,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: json.error ?? 'Something went wrong.',
            createdAt: new Date().toISOString(),
          },
        ]);
      } else {
        persistUi({ conversationId: json.data.conversationId });
        setMessages((m) => [...m, json.data!.assistantMessage]);
        void loadConversations();
      }
    } finally {
      setLoading(false);
      setScreenshot(null);
    }
  };

  const handleNewConversation = async () => {
    const res = await fetch('/api/admin/dev-assistant/conversations', { method: 'POST' });
    const json = (await res.json()) as { ok: boolean; data?: { id: string } };
    if (json.ok && json.data) {
      setMessages([]);
      persistUi({ conversationId: json.data.id });
      void loadConversations();
    }
  };

  const handleClear = async () => {
    if (!ui.conversationId) {
      setMessages([]);
      return;
    }
    await fetch(`/api/admin/dev-assistant/conversations/${ui.conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear' }),
    });
    setMessages([]);
  };

  const handleCopyContext = async () => {
    const ctx = collectDevAssistantContext(admin);
    const text = formatDebugContextForClipboard(ctx);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleScreenshot = async () => {
    persistUi({ open: true, minimized: false });
    const dataUrl = await captureScreenshot();
    if (dataUrl) setScreenshot(dataUrl);
  };

  const handleReportBug = async () => {
    persistUi({ open: true, minimized: false });
    const dataUrl = await captureScreenshot();
    if (dataUrl) setScreenshot(dataUrl);
    setInput('Describe the issue…');
  };

  const panelStyle: React.CSSProperties = {
    width: ui.width,
    height: ui.height,
    ...(ui.x != null && ui.y != null ? { left: ui.x, top: ui.y, right: 'auto', bottom: 'auto' } : {}),
  };

  const onDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, a')) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: ui.x ?? rect.left,
      origY: ui.y ?? rect.top,
    };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging && !resizing) return;

    const onMove = (e: MouseEvent) => {
      if (dragging && dragRef.current) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        persistUi({
          x: Math.max(8, dragRef.current.origX + dx),
          y: Math.max(8, dragRef.current.origY + dy),
        });
      }
      if (resizing && resizeRef.current) {
        const dx = e.clientX - resizeRef.current.startX;
        const dy = e.clientY - resizeRef.current.startY;
        persistUi({
          width: Math.max(320, resizeRef.current.origW + dx),
          height: Math.max(360, resizeRef.current.origH + dy),
        });
      }
    };
    const onUp = () => {
      setDragging(false);
      setResizing(false);
      dragRef.current = null;
      resizeRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, resizing, persistUi]);

  const grouped = ['today', 'yesterday', 'older'] as const;

  return (
    <div className="apg-dev-assistant-root pointer-events-none fixed inset-0 z-[200]">
      <AnimatePresence>
        {ui.open && !ui.minimized && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            style={panelStyle}
            className="pointer-events-auto fixed bottom-20 right-5 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1A1F27] shadow-2xl shadow-black/50"
            onMouseDown={onDragStart}
          >
            <header className="flex cursor-grab items-center justify-between border-b border-white/10 bg-[#141922] px-3 py-2.5 active:cursor-grabbing">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">AI Developer Assistant</p>
                <p className="truncate text-[10px] text-white/45">{providerInfo}</p>
              </div>
              <div className="flex items-center gap-1">
                <IconBtn title="History" onClick={() => setShowHistory((s) => !s)}>🕘</IconBtn>
                <IconBtn title="Minimize" onClick={() => persistUi({ minimized: true })}>—</IconBtn>
                <IconBtn title="Close" onClick={() => persistUi({ open: false })}>✕</IconBtn>
              </div>
            </header>

            {showHistory ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
                <div className="mb-2 flex gap-1">
                  <ActionChip onClick={() => void handleNewConversation()}>+ New</ActionChip>
                  <ActionChip onClick={() => setShowHistory(false)}>Back to chat</ActionChip>
                </div>
                {grouped.map((g) => {
                  const items = conversations.filter((c) => c.group === g);
                  if (items.length === 0) return null;
                  return (
                    <div key={g} className="mb-3">
                      <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-white/40">
                        {groupLabel(g)}
                      </p>
                      {items.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            void loadConversation(c.id);
                            setShowHistory(false);
                          }}
                          className="mb-1 w-full rounded-lg px-2 py-2 text-left text-xs text-white/80 hover:bg-white/5"
                        >
                          <span className="block truncate font-medium">{c.title}</span>
                          <span className="text-[10px] text-white/40">{c.messageCount} messages</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
                  {messages.length === 0 && (
                    <p className="text-xs leading-relaxed text-white/50">
                      Describe a bug, UI issue, or feature request. Context, errors, and page state are collected automatically.
                    </p>
                  )}
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
                        m.role === 'user'
                          ? 'ml-6 bg-[#FF5A1F]/20 text-white'
                          : 'mr-4 bg-white/5 text-white/85'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      {m.screenshotDataUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.screenshotDataUrl} alt="Screenshot" className="mt-2 max-h-24 rounded border border-white/10" />
                      )}
                    </div>
                  ))}
                  {loading && (
                    <p className="text-xs text-white/40">Thinking…</p>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {screenshot && (
                  <div className="relative mx-3 mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={screenshot} alt="Screenshot preview" className="max-h-20 rounded-lg border border-white/15" />
                    <button
                      type="button"
                      onClick={() => setScreenshot(null)}
                      className="absolute -right-1 -top-1 rounded-full bg-black/70 px-1.5 text-[10px] text-white"
                    >
                      ✕
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap gap-1 border-t border-white/10 px-2 py-2">
                  <ActionChip onClick={() => void handleScreenshot()}>📸 Capture</ActionChip>
                  <ActionChip onClick={() => void handleReportBug()}>🐞 Report bug</ActionChip>
                  <ActionChip onClick={() => void handleCopyContext()}>{copied ? '✓ Copied' : '📋 Copy context'}</ActionChip>
                  <ActionChip onClick={() => void handleNewConversation()}>New chat</ActionChip>
                  <ActionChip onClick={() => void handleClear()}>Clear</ActionChip>
                </div>

                <form
                  className="flex gap-2 border-t border-white/10 p-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendMessage(input);
                  }}
                >
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Describe the issue or ask for help…"
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-xs text-white placeholder:text-white/35 outline-none focus:border-[#FF5A1F]/50"
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="rounded-lg bg-[#FF5A1F] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    Send
                  </button>
                </form>
              </>
            )}

            <div
              className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
              onMouseDown={(e) => {
                e.stopPropagation();
                resizeRef.current = {
                  startX: e.clientX,
                  startY: e.clientY,
                  origW: ui.width,
                  origH: ui.height,
                };
                setResizing(true);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="pointer-events-auto fixed bottom-5 right-5 flex flex-col items-end gap-2"
        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)', marginRight: 'env(safe-area-inset-right, 0px)' }}
      >
        {ui.open && ui.minimized && (
          <button
            type="button"
            onClick={() => persistUi({ minimized: false })}
            className="rounded-full border border-white/10 bg-[#1A1F27] px-3 py-1.5 text-[10px] text-white/60 shadow-lg"
          >
            Expand assistant
          </button>
        )}
        <motion.button
          type="button"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            if (ui.open && !ui.minimized) {
              persistUi({ minimized: true });
            } else {
              persistUi({ open: true, minimized: false });
            }
          }}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-gradient-to-br from-[#FF5A1F] to-[#e04a12] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/40"
          aria-label="AI Developer Assistant"
        >
          <span className="text-lg leading-none">🤖</span>
          {!ui.open && <span className="hidden sm:inline">AI Assistant</span>}
        </motion.button>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded-md px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}

function ActionChip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/70 hover:bg-white/5 hover:text-white"
    >
      {children}
    </button>
  );
}
