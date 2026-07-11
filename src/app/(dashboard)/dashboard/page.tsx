import Link from "next/link";
import { getDashboardStats, type DashboardStats } from "@/lib/db/analytics";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

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
    <Card>
      <CardBody>
        <p className="text-xs uppercase tracking-wide text-faint">{label}</p>
        <p className="mt-3 text-3xl font-semibold tracking-tight text-ink">
          {value.toLocaleString()}
        </p>
      </CardBody>
    </Card>
  );
}

function ConversationsChart({
  data,
}: {
  data: DashboardStats["conversationsByDay"];
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold tracking-tight text-ink">
          Last 7 days
        </h3>
      </CardHeader>
      <CardBody>
        <div className="flex h-44 items-end gap-3">
          {data.map((d) => {
            const { weekday, short } = formatDay(d.date);
            const heightPct = (d.count / max) * 100;
            return (
              <div
                key={d.date}
                className="flex flex-1 flex-col items-center gap-2.5"
              >
                <span className="text-xs font-medium text-muted">
                  {d.count}
                </span>
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
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold tracking-tight text-ink">
          Tool usage
        </h3>
      </CardHeader>
      <CardBody>
        {data.length === 0 ? (
          <p className="text-sm text-faint">No tools used yet.</p>
        ) : (
          <ul className="space-y-4">
            {data.map((t) => (
              <li key={t.name}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="truncate font-medium text-ink">
                    {t.name}
                  </span>
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

function MostActiveBots({ data }: { data: DashboardStats["perBot"] }) {
  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold tracking-tight text-ink">
          Most active bots
        </h3>
      </CardHeader>
      <CardBody>
        {data.length === 0 ? (
          <p className="text-sm text-faint">No bots yet.</p>
        ) : (
          <ul className="-my-1 divide-y divide-hairline">
            {data.map((b) => (
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

function EmptyState() {
  return (
    <Card>
      <CardBody className="flex flex-col items-center justify-center px-6 py-20 text-center">
        <h3 className="text-lg font-semibold tracking-tight text-ink">
          No activity yet
        </h3>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Once you create a bot and start having conversations, your analytics
          will show up here.
        </p>
        <ButtonLink href="/dashboard/bots" variant="primary" size="md" className="mt-6">
          Create a bot
        </ButtonLink>
      </CardBody>
    </Card>
  );
}

function Unavailable() {
  return (
    <Card>
      <CardBody className="flex items-center gap-3 text-sm text-muted">
        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[color:var(--warning)]" />
        Analytics unavailable (is the database configured?)
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

  const header = (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">
        Overview
      </h1>
      <p className="mt-2 text-sm text-muted">
        An overview of your bots and conversations.
      </p>
    </div>
  );

  if (failed || !stats) {
    return (
      <div className="space-y-8">
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
      <div className="space-y-8">
        {header}
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-8">
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
