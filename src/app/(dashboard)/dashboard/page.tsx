import Link from "next/link";
import { getDashboardStats, type DashboardStats } from "@/lib/db/analytics";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/badge";
import { Donut } from "@/components/ui/Donut";
import { AreaChart } from "@/components/ui/AreaChart";

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
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-ink">
          Welcome back 👋
        </h1>
        <p className="mt-1.5 text-[15px] text-foreground">
          Here&apos;s what&apos;s happening across your bots and conversations.
        </p>
      </div>
      <div className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-surface px-3.5 py-2 text-sm font-medium text-ink shadow-[var(--shadow-sm)]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-foreground" aria-hidden>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
        </svg>
        Last 7 days
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-foreground" aria-hidden>
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

function ConversationsChart({
  data,
}: {
  data: DashboardStats["conversationsByDay"];
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const chartData = data.map((d) => ({
    label: formatDay(d.date).weekday,
    value: d.count,
  }));
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-ink">
            Conversations over time
          </h3>
          <p className="mt-0.5 text-xs text-foreground">Last 7 days</p>
        </div>
        <span className="text-2xl font-semibold tracking-tight text-ink">
          {total.toLocaleString()}
        </span>
      </CardHeader>
      <CardBody className="flex-1">
        <AreaChart data={chartData} height={200} />
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
        <p className="mt-0.5 text-xs text-foreground">Across all conversations</p>
      </CardHeader>
      <CardBody className="flex-1">
        {data.length === 0 ? (
          <p className="text-sm text-foreground">No tools used yet.</p>
        ) : (
          <ul className="space-y-4">
            {data.slice(0, 5).map((t) => (
              <li key={t.name}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="truncate font-medium text-ink">{t.name}</span>
                  <span className="ml-2 shrink-0 text-foreground">{t.count}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
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
          <p className="text-sm text-foreground">
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
                  <span className="truncate text-sm font-medium text-ink group-hover:text-foreground">
                    {b.name}
                  </span>
                  <Badge variant="secondary">
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
  const barsIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
      <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const gearIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" strokeLinecap="round" />
    </svg>
  );
  const actions: { href: string; label: string; icon: React.ReactNode }[] = [
    { href: "/dashboard/bots/new", label: "New bot", icon: ICONS.bot },
    { href: "/dashboard/conversations", label: "Conversations", icon: ICONS.chat },
    { href: "/dashboard/analytics", label: "Analytics", icon: barsIcon },
    { href: "/dashboard/settings", label: "Settings", icon: gearIcon },
  ];
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <h3 className="text-sm font-semibold tracking-tight text-ink">
          Quick actions
        </h3>
      </CardHeader>
      <CardBody className="flex-1">
        <div className="grid grid-cols-2 gap-3">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-hairline bg-surface-2 px-3 py-5 text-center transition-colors hover:border-hairline-strong hover:bg-muted"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface text-foreground shadow-[var(--shadow-sm)]">
                {a.icon}
              </span>
              <span className="text-[13px] font-medium text-ink">{a.label}</span>
            </Link>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function Unavailable() {
  return (
    <Card>
      <CardBody className="flex items-center gap-3 text-sm text-foreground">
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
        <p className="mt-2 max-w-sm text-sm text-foreground">
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
        <div className="lg:col-span-2">
          <RecentActivity data={stats.perBot} />
        </div>
        <QuickActions />
      </div>

      <TopQuestions data={stats.topQuestions} />
    </div>
  );
}
