"use client";

import { useState } from "react";
import { Sparkles, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopilot } from "./CopilotProvider";

interface PendingApproval {
  approvalId: string;
  toolName: string;
  arguments: string;
}
type Turn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | { role: "approvals"; pending: PendingApproval[] };

async function post(body: unknown) {
  const res = await fetch("/api/copilot/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

function applyResponse(data: unknown, thread: Turn[]): Turn[] {
  if (data && typeof data === "object" && "type" in data) {
    const d = data as
      | { type: "message"; content: string }
      | { type: "approvals"; pending: PendingApproval[] };
    if (d.type === "message")
      return [...thread, { role: "assistant", text: d.content }];
    if (d.type === "approvals")
      return [...thread, { role: "approvals", pending: d.pending }];
  }
  return [
    ...thread,
    { role: "assistant", text: "Something went wrong. Please try again." },
  ];
}

export default function CopilotPanel() {
  const { open, setOpen, mode, setMode } = useCopilot();
  const [thread, setThread] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open copilot"
        className="fixed bottom-6 right-6 z-40 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition-colors hover:bg-primary/80"
      >
        <Sparkles className="h-5 w-5" />
      </button>
    );
  }

  const lastTurn = thread[thread.length - 1];
  const pendingApproval = lastTurn?.role === "approvals";

  async function send() {
    const text = input.trim();
    if (!text || busy || pendingApproval) return;
    setInput("");
    setThread((t) => [...t, { role: "user", text }]);
    setBusy(true);
    try {
      const data = await post({ kind: "message", text });
      setThread((t) => applyResponse(data, t));
    } finally {
      setBusy(false);
    }
  }

  async function decide(approvalId: string, approve: boolean) {
    setBusy(true);
    try {
      const data = await post({
        kind: "decision",
        decisions: [{ approvalId, approve }],
      });
      setThread((t) => applyResponse(data, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-80 shrink-0 flex-col border-l border-border bg-card text-card-foreground xl:flex">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4" /> Copilot
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode(mode === "accept" ? "auto" : "accept")}
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {mode === "accept" ? "Accept" : "Auto"}
          </button>
          <button onClick={() => setOpen(false)} aria-label="Close copilot">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
        {thread.map((turn, i) => {
          if (turn.role === "approvals") {
            return (
              <div key={i} className="space-y-2">
                {turn.pending.map((p) => (
                  <div
                    key={p.approvalId}
                    className="rounded-lg border border-border p-3"
                  >
                    <p className="mb-2 text-foreground">
                      Run <span className="font-medium">{p.toolName}</span>?
                    </p>
                    <pre className="mb-2 overflow-x-auto text-xs text-muted-foreground">
                      {p.arguments}
                    </pre>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => decide(p.approvalId, true)}
                        disabled={busy}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => decide(p.approvalId, false)}
                        disabled={busy}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            );
          }
          return (
            <div
              key={i}
              className={
                turn.role === "user" ? "text-foreground" : "text-muted-foreground"
              }
            >
              {turn.text}
            </div>
          );
        })}
        {busy && <div className="text-muted-foreground">Thinking…</div>}
      </div>

      <div className="border-t border-border p-3">
        {pendingApproval && (
          <p className="mb-2 text-xs text-muted-foreground">
            Approve or reject the pending action first.
          </p>
        )}
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
            placeholder="Ask the copilot…"
            disabled={pendingApproval}
            className="min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          />
          <Button
            onClick={() => void send()}
            disabled={busy || pendingApproval}
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
