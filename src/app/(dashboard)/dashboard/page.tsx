import Link from "next/link";
import { getDashboardStats, type DashboardStats } from "@/lib/db/analytics";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Donut } from "@/components/ui/Donut";

function formatDay(date: string): { weekday: string; short: string } {
  const d = new Date(`${date}T00:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    short: d.toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
      timeZone: "UTC",
    }),
  };
}

/** Delta fraction vs. previous period, or undefined when there's no baseline. */
function delta(current: number, prev: number): number | undefined {
  return prev > 0 ? (current - prev) / prev : undefined;
}

const ICONS = {
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  bot: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
      <rect x="4" y="8" width="16" height="11" rx="3" />
      <path d="M12 8V4M9 13h.01M15 13h.01" strokeLinecap="round" />
    </svg>
  ),
  message: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
      <path d="M4 4h16v12H7l-3 3z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  cart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M3 4h2l2.4 11.4a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.8L21 8H6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
} as const;

function Header() {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">
        Welcome back
      </h1>
      <p className="mt-2 text-[15px] text-muted">
        Here&apos;s what&apos;s happening across your bots and conversations.
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
    <Card className="flex h-full flex-col">
      <CardHeader>
        <h3 className="text-sm font-semibold tracking-tight text-ink">
          Conversations
        </h3>
        <p className="mt-0.5 text-xs text-faint">Last 7 days</p>
      </CardHeader>
      <CardBody className="flex-1">
        <div className="flex h-44 items-end gap-2.5">
          {data.map((d) => {
            const { weekday, short } = formatDay(d.date);
            const heightPct = (d.count / max) * 100;
            return (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-medium text-muted">{d.count}</span>
                <div className="flex w-full flex-1 items-end rounded-md bg-surface-2">
                  <div
                    className="w-full rounded-t-md bg-accent transition-all duration-300"
                    style={{
                      height: `${heightPct}%`,
                      minHeight: d.count > 0 ? "4px" : "2px",
                    }}
                    aria-hidden
                  />
                </div>
                <span className="text-center text-[11px] leading-tight text-faint">
                  {weekday}
                  <br />
                  {short}
                </span>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

function ToolUsage({ data }: { data: DashboardStats["toolUsage"] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <h3 className="text-sm font-semibold tracking-tight text-ink">
          Top tools
        </h3>
        <p className="mt-0.5 text-xs text-faint">Across all conversations</p>
      </CardHeader>
      <CardBody className="flex-1">
        {data.length === 0 ? (
          <p className="text-sm text-faint">No tools used yet.</p>
        ) : (
          <ul className="space-y-4">
            {data.slice(0, 5).map((t) => (
              <li key={t.name}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="truncate font-medium text-ink">{t.name}</span>
                  <span className="ml-2 shrink-0 text-muted">{t.count}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-accent-soft">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-300"
                    style={{ width: `${(t.count / max) * 100}%` }}
                    aria-hidden
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function LiveStatus() {
  const rows: { label: string; state: "ok" | "warn"; note: string }[] = [
    { label: "Supabase", state: "ok", note: "Operational" },
    { label: "OpenRouter", state: "ok", note: "Operational" },
    { label: "Agent runtime", state: "warn", note: "Degraded" },
  ];
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <h3 className="text-sm font-semibold tracking-tight text-ink">
          Live status
        </h3>
        <p className="mt-0.5 text-xs text-faint">Service health</p>
      </CardHeader>
      <CardBody className="flex-1">
        <ul className="space-y-3.5">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between">
              <span className="flex items-center gap-2.5 text-sm text-ink">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    background:
                      r.state === "ok"
                        ? "var(--success)"
                        : "var(--warning)",
                  }}
                  aria-hidden
                />
                {r.label}
              </span>
              <span className="text-xs text-faint">{r.note}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function RecentActivity({ data }: { data: DashboardStats["perBot"] }) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <h3 className="text-sm font-semibold tracking-tight text-ink">
          Most active bots
        </h3>
      </CardHeader>
      <CardBody className="flex-1">
        {data.length === 0 ? (
          <p className="text-sm text-faint">
            No bot activity yet. Once conversations come in, your most active
            bots will appear here.
          </p>
        ) : (
          <ul className="-my-1 divide-y divide-hairline">
            {data.slice(0, 6).map((b) => (
              <li key={b.botId}>
                <Link
                  href={`/dashboard/bots/${b.botId}`}
                  className="group flex items-center justify-between gap-3 py-3 transition-colors"
                >
                  <span className="truncate text-sm font-medium text-ink group-hover:text-accent">
                    {b.name}
                  </span>
                  <Badge tone="neutral">
                    {b.conversationCount.toLocaleString()} conv.
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function TopQuestions({ data }: { data: DashboardStats["topQuestions"] }) {
  const donutData = data.slice(0, 6).map((q) => ({
    label: q.question,
    value: q.count,
  }));
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <h3 className="text-sm font-semibold tracking-tight text-ink">
          Top questions
        </h3>
      </CardHeader>
      <CardBody className="flex-1">
        <Donut data={donutData} />
      </CardBody>
    </Card>
  );
}

function QuickActions() {
  const actions: { href: string; label: string }[] = [
    { href: "/dashboard/bots/new", label: "New bot" },
    { href: "/dashboard/conversations", label: "Conversations" },
    { href: "/dashboard/analytics", label: "Analytics" },
    { href: "/dashboard/settings", label: "Settings" },
  ];
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <h3 className="text-sm font-semibold tracking-tight text-ink">
          Quick actions
        </h3>
      </CardHeader>
      <CardBody className="flex-1">
        <div className="grid gap-2.5">
          <ButtonLink href={actions[0].href} variant="primary" size="md">
            {actions[0].label}
          </ButtonLink>
          {actions.slice(1).map((a) => (
            <ButtonLink
              key={a.href}
              href={a.href}
              variant="secondary"
              size="md"
            >
              {a.label}
            </ButtonLink>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function Unavailable() {
  return (
    <Card>
      <CardBody className="flex items-center gap-3 text-sm text-muted">
        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[color:var(--warning)]" />
        Analytics unavailable (is the database migrated?)
      </CardBody>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardBody className="flex flex-col items-center justify-center px-6 py-20 text-center">
        <h3 className="text-lg font-semibold tracking-tight text-ink">
          Let&apos;s get you set up
        </h3>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Create your first bot and connect your store. Your conversations and
          analytics will show up here.
        </p>
        <ButtonLink
          href="/dashboard/onboarding"
          variant="primary"
          size="md"
          className="mt-6"
        >
          Get started
        </ButtonLink>
      </CardBody>
    </Card>
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

  if (failed || !stats) {
    return (
      <div className="space-y-8">
        <Header />
        <Unavailable />
      </div>
    );
  }

  if (stats.botCount === 0) {
    return (
      <div className="space-y-8">
        <Header />
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Header />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Conversations"
          value={stats.conversationCount.toLocaleString()}
          delta={delta(stats.conversationCount, stats.prev.conversationCount)}
          icon={ICONS.chat}
        />
        <StatCard
          label="Active bots"
          value={stats.botCount.toLocaleString()}
          icon={ICONS.bot}
        />
        <StatCard
          label="Messages"
          value={stats.messageCount.toLocaleString()}
          delta={delta(stats.messageCount, stats.prev.messageCount)}
          icon={ICONS.message}
        />
        <StatCard
          label="Cart adds"
          value={stats.cartAdds.toLocaleString()}
          icon={ICONS.cart}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ConversationsChart data={stats.conversationsByDay} />
        </div>
        <ToolUsage data={stats.toolUsage} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <LiveStatus />
        <div className="lg:col-span-2">
          <RecentActivity data={stats.perBot} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TopQuestions data={stats.topQuestions} />
        </div>
        <QuickActions />
      </div>
    </div>
  );
}
