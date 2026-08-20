export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-sm text-[var(--plt-text-muted)]">
      <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-[var(--plt-border-strong)] border-t-[var(--plt-accent)]" />
      {message}
    </div>
  );
}
