export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded-md bg-white/10" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="fyh-glass h-24 rounded-lg bg-white/5" />
        ))}
      </div>
      <div className="fyh-glass h-64 rounded-lg bg-white/5" />
    </div>
  );
}
