import Link from "next/link";
import { listConversationsForOwner } from "@/lib/db/conversations";
import type { ConversationStatus } from "@/lib/db/conversations";
import { listBots } from "@/lib/db/bots";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

const STATUS_VARIANTS: Record<
  ConversationStatus,
  "default" | "outline" | "secondary"
> = {
  active: "default",
  awaiting_tool: "outline",
  closed: "secondary",
};

const STATUS_LABELS: Record<ConversationStatus, string> = {
  active: "Active",
  awaiting_tool: "Awaiting tool",
  closed: "Closed",
};

function StatusBadge({ status }: { status: ConversationStatus }) {
  return (
    <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
  );
}

export default async function ConversationsPage() {
  const [conversations, bots] = await Promise.all([
    listConversationsForOwner(),
    listBots(),
  ]);

  const botNames = new Map(bots.map((b) => [b.id, b.name]));

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Conversations
        </h1>
        <p className="mt-2 text-sm text-foreground">
          Transcripts of chats between shoppers and your bots.
        </p>
      </div>

      {conversations.length === 0 ? (
        <Card>
          <CardBody className="py-16 text-center">
            <p className="text-sm text-foreground">
              No conversations yet — they&apos;ll appear here once shoppers chat
              with your bots.
            </p>
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-hairline">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/conversations/${c.id}`}
                  className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-surface-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <p className="truncate font-medium text-ink">
                        {botNames.get(c.bot_id) ?? "Unknown bot"}
                      </p>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="mt-1 text-xs text-foreground">
                      {c.message_count} message
                      {c.message_count === 1 ? "" : "s"}
                      {" · "}Created {formatDate(c.created_at)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-foreground">Updated</p>
                    <p className="text-sm text-foreground">
                      {formatDate(c.updated_at)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
