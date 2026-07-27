export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="fyh-glass mx-auto max-w-xl p-10 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.28em] text-fyh-accent">
        For Your Hair ERP
      </p>
      <h1 className="fyh-display mt-3 text-3xl font-semibold tracking-tight text-fyh-text">
        {title}
      </h1>
      <p className="mt-3 text-sm text-fyh-text-secondary">
        {description ?? 'Coming Soon — this module will be built next.'}
      </p>
    </div>
  );
}
