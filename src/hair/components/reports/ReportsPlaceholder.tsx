export function ReportsPlaceholder({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="fyh-glass mx-auto max-w-lg space-y-3 p-8 text-center">
      <h2 className="fyh-display text-xl font-semibold">{title}</h2>
      <p className="text-sm text-fyh-text-secondary">
        {description ?? 'This report will ship in a follow-up phase. Revenue and staff performance views are live now.'}
      </p>
    </div>
  );
}
