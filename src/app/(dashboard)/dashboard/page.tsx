export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
          Welcome
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          This is your dashboard. Panels and insights will appear here soon.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white text-sm text-neutral-400"
          >
            Placeholder panel
          </div>
        ))}
      </div>
    </div>
  );
}
