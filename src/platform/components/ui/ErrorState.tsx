type Props = {
  title?: string;
  message?: string;
};

export function ErrorState({ title = 'Something went wrong', message }: Props) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-8 text-center">
      <p className="text-sm font-medium text-red-700">{title}</p>
      {message ? <p className="mt-1 text-sm text-[var(--plt-text-muted)]">{message}</p> : null}
    </div>
  );
}
