import Link from "next/link";
import { getDashboardStats, type DashboardStats } from "@/lib/db/analytics";

function formatDay(date: string): { weekday: string; short: string } {
  const d = new Date(`${date}T00:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    short: d.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC",
    }),
  };
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function ConversationsChart({
  data,
}: {
  data: DashboardStats["conversationsByDay"];
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h3 className="text-sm font-medium text-neutral-900">
        Conversations (last 7 days)
      </h3>
      <div className="mt-6 flex h-40 items-end gap-2">
        {data.map((d) => {
          const { weekday, short } = formatDay(d.date);
          const heightPct = (d.count / max) * 100;
          return (
            <div
              key={d.date}
              className="flex flex-1 flex-col items-center gap-2"
            >
              <span className="text-xs font-medium text-neutral-700">
                {d.count}
              </span>
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-md bg-neutral-800 transition-all"
                  style={{ height: `${heightPct}%`, minHeight: d.count > 0 ? "4px" : "2px" }}
                  aria-hidden
                />
              </div>
              <span className="text-center text-[11px] leading-tight text-neutral-500">
                {weekday}
                <br />
                {short}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ToolUsage({ data }: { data: DashboardStats["toolUsage"] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h3 className="text-sm font-medium text-neutral-900">Tool usage</h3>
      {data.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-400">No tools used yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {data.map((t) => (
            <li key={t.name}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="truncate font-medium text-neutral-700">
                  {t.name}
                </span>
                <span className="ml-2 shrink-0 text-neutral-500">{t.count}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-neutral-800"
                  style={{ width: `${(t.count / max) * 100}%` }}
                  aria-hidden
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MostActiveBots({ data }: { data: DashboardStats["perBot"] }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h3 className="text-sm font-medium text-neutral-900">Most active bots</h3>
      {data.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-400">No bots yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-neutral-100">
          {data.map((b) => (
            <li key={b.botId}>
              <Link
                href={`/dashboard/bots/${b.botId}`}
                className="flex items-center justify-between py-2.5 text-sm hover:text-neutral-900"
              >
                <span className="truncate font-medium text-neutral-700">
                  {b.name}
                </span>
                <span className="ml-2 shrink-0 text-neutral-500">
                  {b.conversationCount.toLocaleString()} conv.
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
      <h3 className="text-lg font-medium text-neutral-900">No activity yet</h3>
      <p className="mt-1 max-w-sm text-sm text-neutral-500">
        Once you create a bot and start having conversations, your analytics
        will show up here.
      </p>
      <Link
        href="/dashboard/bots"
        className="mt-5 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Create a bot
      </Link>
    </div>
  );
}

function Unavailable() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
      Analytics unavailable (is the database configured?)
    </div>
  );
}

export default async function DashboardPage() {
  let stats: DashboardStats | null = null;
  let failed = false;

  try {
    stats = await getDashboardStats();
  } catch {
    failed = true;
  }

  const header = (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
        Analytics
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        An overview of your bots and conversations.
      </p>
    </div>
  );

  if (failed || !stats) {
    return (
      <div className="space-y-6">
        {header}
        <Unavailable />
      </div>
    );
  }

  const isEmpty =
    stats.botCount === 0 &&
    stats.conversationCount === 0 &&
    stats.messageCount === 0;

  if (isEmpty) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Bots" value={stats.botCount} />
        <StatCard label="Conversations" value={stats.conversationCount} />
        <StatCard
          label="Active conversations"
          value={stats.activeConversationCount}
        />
        <StatCard label="Messages" value={stats.messageCount} />
      </div>

      <ConversationsChart data={stats.conversationsByDay} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ToolUsage data={stats.toolUsage} />
        <MostActiveBots data={stats.perBot} />
      </div>
    </div>
  );
}
