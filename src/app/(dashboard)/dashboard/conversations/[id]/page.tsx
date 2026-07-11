import Link from "next/link";
import { notFound } from "next/navigation";
import { getConversationForOwner } from "@/lib/db/conversations";
import type { ConversationStatus } from "@/lib/db/conversations";
import { listBots } from "@/lib/db/bots";

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

const STATUS_LABELS: Record<ConversationStatus, string> = {
  active: "Active",
  awaiting_tool: "Awaiting tool",
  closed: "Closed",
};

/** Turn an unknown message `content` into a readable string. */
function contentToText(content: unknown): string {
  if (content === null || content === undefined) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === "object" && "text" in part) {
          const t = (part as { text?: unknown }).text;
          if (typeof t === "string") return t;
        }
        if (typeof part === "string") return part;
        return JSON.stringify(part);
      })
      .join("");
  }
  return JSON.stringify(content);
}

/** Pretty-print JSON-ish content for tool results. */
function prettyJson(value: unknown): string {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

interface ToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
  name?: string;
}

interface ChatMessage {
  role?: string;
  content?: unknown;
  tool_calls?: unknown;
  tool_call_id?: string;
  name?: string;
}

function asMessage(raw: unknown): ChatMessage {
  return raw && typeof raw === "object" ? (raw as ChatMessage) : {};
}

function getToolCalls(msg: ChatMessage): ToolCall[] {
  return Array.isArray(msg.tool_calls) ? (msg.tool_calls as ToolCall[]) : [];
}

function ToolCallChip({ call }: { call: ToolCall }) {
  const name = call.function?.name ?? call.name ?? "unknown";
  const args = call.function?.arguments ?? "";
  return (
    <div className="mt-2 inline-flex max-w-full items-start gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 font-mono text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
      <span aria-hidden>🔧</span>
      <span className="break-all">
        called {name}({args})
      </span>
    </div>
  );
}

function MessageBlock({ raw }: { raw: unknown }) {
  const msg = asMessage(raw);
  const role = msg.role;
  const text = contentToText(msg.content);
  const toolCalls = getToolCalls(msg);

  if (role === "system") {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50/50 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-500">
        <span className="font-medium uppercase tracking-wide">System</span>
        {text && <p className="mt-1 whitespace-pre-wrap">{text}</p>}
      </div>
    );
  }

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-zinc-900 px-3.5 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
          <p className="whitespace-pre-wrap break-words">{text || "—"}</p>
        </div>
      </div>
    );
  }

  if (role === "tool") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%]">
          <p className="mb-1 text-xs text-zinc-400">
            ↳ result{msg.name ? ` · ${msg.name}` : ""}
          </p>
          <pre className="overflow-x-auto rounded-md bg-zinc-950 px-3 py-2 text-xs text-zinc-100">
            <code>{prettyJson(msg.content)}</code>
          </pre>
        </div>
      </div>
    );
  }

  if (role === "assistant") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%]">
          {(text || toolCalls.length === 0) && (
            <div className="rounded-2xl rounded-bl-sm border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
              <p className="whitespace-pre-wrap break-words">{text || "—"}</p>
            </div>
          )}
          {toolCalls.map((call, i) => (
            <div key={call.id ?? i}>
              <ToolCallChip call={call} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Unknown shape — render defensively.
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="mb-1 text-xs text-zinc-400">{role ?? "unknown"}</p>
      <pre className="overflow-x-auto text-xs text-zinc-600 dark:text-zinc-400">
        <code>{prettyJson(raw)}</code>
      </pre>
    </div>
  );
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const conversation = await getConversationForOwner(id);
  if (!conversation) notFound();

  const bots = await listBots();
  const botName =
    bots.find((b) => b.id === conversation.bot_id)?.name ?? "Unknown bot";

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link
        href="/dashboard/conversations"
        className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-200"
      >
        &larr; Back to conversations
      </Link>

      <div className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {botName}
          </h1>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {STATUS_LABELS[conversation.status]}
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Created {formatDate(conversation.created_at)} · Updated{" "}
          {formatDate(conversation.updated_at)}
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {conversation.messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No messages in this conversation.
          </p>
        ) : (
          conversation.messages.map((raw, i) => (
            <MessageBlock key={i} raw={raw} />
          ))
        )}
      </div>
    </div>
  );
}
