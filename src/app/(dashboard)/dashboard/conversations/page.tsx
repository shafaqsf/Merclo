import Link from "next/link";
import { listConversationsForOwner } from "@/lib/db/conversations";
import type { ConversationStatus } from "@/lib/db/conversations";
import { listBots } from "@/lib/db/bots";

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

const STATUS_STYLES: Record<ConversationStatus, string> = {
  active:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  awaiting_tool:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  closed: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

const STATUS_LABELS: Record<ConversationStatus, string> = {
  active: "Active",
  awaiting_tool: "Awaiting tool",
  closed: "Closed",
};

function StatusBadge({ status }: { status: ConversationStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export default async function ConversationsPage() {
  const [conversations, bots] = await Promise.all([
    listConversationsForOwner(),
    listBots(),
  ]);

  const botNames = new Map(bots.map((b) => [b.id, b.name]));

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Conversations
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Transcripts of chats between shoppers and your bots.
        </p>
      </div>

      {conversations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No conversations yet — they&apos;ll appear here once shoppers chat
            with your bots.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/dashboard/conversations/${c.id}`}
                className="flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                      {botNames.get(c.bot_id) ?? "Unknown bot"}
                    </p>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {c.message_count} message{c.message_count === 1 ? "" : "s"}
                    {" · "}Created {formatDate(c.created_at)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Updated
                  </p>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">
                    {formatDate(c.updated_at)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
