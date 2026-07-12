/**
 * Deep analytics for the signed-in merchant. Server component: all aggregation
 * happens in the data layer (getDashboardStats), which also reads the clock so
 * we never call Date.now() during render.
 */
import Link from "next/link";
import { getDashboardStats, type DashboardStats } from "@/lib/db/analytics";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

/** delta = prev>0 ? (cur-prev)/prev : undefined */
function delta(cur: number, prev: number): number | undefined {
  return prev > 0 ? (cur - prev) / prev : undefined;
}

export default async function AnalyticsPage() {
  let stats: DashboardStats | null = null;
  try {
    stats = await getDashboardStats();
  } catch {
    stats = null;
  }

  if (!stats) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <Header />
        <Card className="mt-8 p-8 text-center">
          <p className="text-sm font-medium text-ink">Analytics unavailable</p>
          <p className="mt-1.5 text-sm text-muted">
            We couldn&apos;t load your analytics. Is the database migrated?
          </p>
        </Card>
      </div>
    );
  }

  const {
    conversationCount,
    messageCount,
    cartAdds,
    csat,
    topQuestions,
    toolUsage,
    perBot,
    prev,
  } = stats;

  const everythingZero =
    conversationCount === 0 &&
    messageCount === 0 &&
    cartAdds === 0 &&
    csat.up === 0 &&
    csat.down === 0;

  const csatValue =
    csat.score === null ? "—" : `${Math.round(csat.score * 100)}%`;
  const maxTool = toolUsage.reduce((m, t) => Math.max(m, t.count), 0);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <Header />

      {everythingZero ? (
        <Card className="mt-8 p-8 text-center">
          <p className="text-sm font-medium text-ink">No data yet</p>
          <p className="mt-1.5 text-sm text-muted">
            Once your bots start handling conversations, insights will appear
            here.
          </p>
        </Card>
      ) : (
        <>
          {/* KPI row */}
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="CSAT"
              value={
                <span className="flex items-baseline gap-2">
                  {csatValue}
                  <span className="text-xs font-normal text-faint">
                    {csat.up} up · {csat.down} down
                  </span>
                </span>
              }
            />
            <StatCard label="Cart-adds" value={cartAdds} />
            <StatCard
              label="Conversations"
              value={conversationCount}
              delta={delta(conversationCount, prev.conversationCount)}
            />
            <StatCard
              label="Messages"
              value={messageCount}
              delta={delta(messageCount, prev.messageCount)}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Top questions */}
            <Card className="p-6">
              <h2 className="text-sm font-semibold text-ink">Top questions</h2>
              {topQuestions.length === 0 ? (
                <p className="mt-4 text-sm text-faint">No questions yet.</p>
              ) : (
                <ol className="mt-4 space-y-2.5">
                  {topQuestions.map((q, i) => (
                    <li
                      key={`${q.question}-${i}`}
                      className="flex items-start justify-between gap-3"
                    >
                      <span className="flex min-w-0 items-start gap-2.5 text-sm text-ink">
                        <span className="mt-0.5 w-4 shrink-0 text-right text-xs font-medium text-faint">
                          {i + 1}
                        </span>
                        <span className="truncate">{q.question}</span>
                      </span>
                      <Badge tone="neutral">{q.count}</Badge>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            {/* Needs attention */}
            <Card className="p-6">
              <h2 className="text-sm font-semibold text-ink">
                Unanswered / needs attention
              </h2>
              <p className="mt-4 text-2xl font-semibold tracking-tight text-ink">
                {csat.down}{" "}
                <span className="text-base font-normal text-muted">
                  {csat.down === 1 ? "reply" : "replies"} rated not helpful
                </span>
              </p>
              <p className="mt-2 text-xs text-faint">
                A dedicated unanswered-questions view is coming. For now this is
                the count of thumbs-down feedback across your bots — a good
                signal of where replies fell short.
              </p>
            </Card>

            {/* Tool usage */}
            <Card className="p-6">
              <h2 className="text-sm font-semibold text-ink">Tool usage</h2>
              {toolUsage.length === 0 ? (
                <p className="mt-4 text-sm text-faint">No tool calls yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {toolUsage.map((t) => (
                    <li key={t.name}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-ink">{t.name}</span>
                        <span className="text-faint">{t.count}</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-accent-soft">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{
                            width: `${
                              maxTool > 0 ? (t.count / maxTool) * 100 : 0
                            }%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Most active bots */}
            <Card className="p-6">
              <h2 className="text-sm font-semibold text-ink">
                Most active bots
              </h2>
              {perBot.length === 0 ? (
                <p className="mt-4 text-sm text-faint">No bots yet.</p>
              ) : (
                <ul className="mt-4 space-y-1">
                  {perBot.map((b) => (
                    <li key={b.botId}>
                      <Link
                        href={`/dashboard/bots/${b.botId}`}
                        className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-surface-2"
                      >
                        <span className="truncate text-ink">{b.name}</span>
                        <Badge tone="neutral">
                          {b.conversationCount}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">
        Analytics
      </h1>
      <p className="mt-1.5 text-sm text-muted">
        How your bots are performing over the last 7 days.
      </p>
    </div>
  );
}
