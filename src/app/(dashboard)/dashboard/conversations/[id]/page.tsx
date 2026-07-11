import { notFound } from "next/navigation";
import { getConversationForOwner } from "@/lib/db/conversations";
import type { ConversationStatus } from "@/lib/db/conversations";
import { listBots } from "@/lib/db/bots";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

const STATUS_TONES: Record<
  ConversationStatus,
  "accent" | "warning" | "neutral"
> = {
  active: "accent",
  awaiting_tool: "warning",
  closed: "neutral",
};

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
    <div className="mt-2 inline-flex max-w-full items-start gap-1.5 rounded-full bg-surface-2 px-3 py-1 font-mono text-xs text-muted">
      <span aria-hidden>🔧</span>
      <span className="break-all">
        {name}({args})
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
      <div className="text-center">
        <span className="text-[11px] font-medium uppercase tracking-wide text-faint">
          System
        </span>
        {text && (
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{text}</p>
        )}
      </div>
    );
  }

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-accent-ink">
          <p className="whitespace-pre-wrap break-words">{text || "—"}</p>
        </div>
      </div>
    );
  }

  if (role === "tool") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%]">
          <p className="mb-1 text-xs text-faint">
            ↳ result{msg.name ? ` · ${msg.name}` : ""}
          </p>
          <pre className="overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-muted">
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
            <div className="rounded-2xl rounded-bl-md border border-hairline bg-surface px-4 py-2.5 text-sm text-ink">
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
    <div className="rounded-xl border border-hairline bg-surface-2 px-3 py-2">
      <p className="mb-1 text-xs text-faint">{role ?? "unknown"}</p>
      <pre className="overflow-x-auto font-mono text-xs text-muted">
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
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <Card>
        <CardBody>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-tight text-ink">
                  {botName}
                </h1>
                <Badge tone={STATUS_TONES[conversation.status]}>
                  {STATUS_LABELS[conversation.status]}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted">
                Created {formatDate(conversation.created_at)} · Updated{" "}
                {formatDate(conversation.updated_at)}
              </p>
            </div>
            <ButtonLink
              href="/dashboard/conversations"
              variant="ghost"
              size="sm"
              className="shrink-0"
            >
              &larr; Back
            </ButtonLink>
          </div>
        </CardBody>
      </Card>

      <div className="mt-6 space-y-3">
        {conversation.messages.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted">
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
