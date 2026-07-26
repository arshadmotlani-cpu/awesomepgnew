/** True when keystrokes should stay in the focused field (never trigger nav chords). */
export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as HTMLElement;
  if (typeof el.isContentEditable === 'boolean' && el.isContentEditable) return true;
  const tag = typeof el.tagName === 'string' ? el.tagName : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (typeof el.closest === 'function') {
    return Boolean(el.closest('input, textarea, select, [contenteditable="true"]'));
  }
  return false;
}
