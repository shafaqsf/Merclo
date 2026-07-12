"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/Field";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { BotTabs } from "../_components/BotTabs";

type KnowledgeKind = "faq" | "policy" | "note";

interface KnowledgeSource {
  id: string;
  bot_id: string;
  title: string;
  content: string;
  kind: KnowledgeKind;
  created_at: string;
  updated_at: string;
}

const KINDS: KnowledgeKind[] = ["faq", "policy", "note"];

const KIND_LABEL: Record<KnowledgeKind, string> = {
  faq: "FAQ",
  policy: "Policy",
  note: "Note",
};

const KIND_VARIANT: Record<
  KnowledgeKind,
  "default" | "outline" | "secondary"
> = {
  faq: "default",
  policy: "outline",
  note: "secondary",
};

const selectClass =
  "w-full rounded-xl border border-hairline bg-surface-2 px-3.5 py-2.5 text-sm " +
  "text-ink transition-colors outline-none focus:border-accent focus:bg-surface";

function isKind(v: unknown): v is KnowledgeKind {
  return v === "faq" || v === "policy" || v === "note";
}

function toEntry(raw: unknown): KnowledgeSource | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  return {
    id: r.id,
    bot_id: typeof r.bot_id === "string" ? r.bot_id : "",
    title: typeof r.title === "string" ? r.title : "",
    content: typeof r.content === "string" ? r.content : "",
    kind: isKind(r.kind) ? r.kind : "note",
    created_at: typeof r.created_at === "string" ? r.created_at : "",
    updated_at: typeof r.updated_at === "string" ? r.updated_at : "",
  };
}

function toEntries(raw: unknown): KnowledgeSource[] {
  if (!Array.isArray(raw)) return [];
  const out: KnowledgeSource[] = [];
  for (const item of raw) {
    const entry = toEntry(item);
    if (entry) out.push(entry);
  }
  return out;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (
      typeof data === "object" &&
      data !== null &&
      typeof (data as Record<string, unknown>).error === "string"
    ) {
      return (data as Record<string, unknown>).error as string;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export default function KnowledgePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [entries, setEntries] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Add form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<KnowledgeKind>("faq");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bots/${id}/knowledge`);
        if (!res.ok) throw new Error(await errorMessage(res, "Failed to load."));
        const data: unknown = await res.json();
        if (!cancelled) setEntries(toEntries(data));
      } catch (err) {
        if (!cancelled)
          setLoadError(
            err instanceof Error ? err.message : "Failed to load entries."
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    setAdding(true);
    try {
      const res = await fetch(`/api/bots/${id}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          kind,
        }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Failed to add."));
      const created = toEntry(await res.json());
      if (created) setEntries((prev) => [created, ...prev]);
      setTitle("");
      setContent("");
      setKind("faq");
    } catch (err) {
      setAddError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setAdding(false);
    }
  }

  function handleSaved(updated: KnowledgeSource) {
    setEntries((prev) =>
      prev.map((e) => (e.id === updated.id ? updated : e))
    );
  }

  function handleDeleted(deletedId: string) {
    setEntries((prev) => prev.filter((e) => e.id !== deletedId));
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <Link
        href={`/dashboard/bots/${id}`}
        className="text-sm text-muted transition-colors hover:text-ink"
      >
        &larr; Back to bot
      </Link>

      <div className="mt-6">
        <BotTabs botId={id} active="knowledge" />
      </div>

      <div className="mt-8">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Knowledge
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Add FAQs, policies, and product info your assistant can answer from.
        </p>
      </div>

      <Card className="mt-8">
        <CardBody className="p-8">
          <form onSubmit={handleAdd} className="space-y-6">
            <Field label="Title" htmlFor="k-title">
              <Input
                id="k-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. What is your return policy?"
              />
            </Field>

            <Field label="Content" htmlFor="k-content">
              <Textarea
                id="k-content"
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="The answer your assistant should give…"
              />
            </Field>

            <Field label="Kind" htmlFor="k-kind">
              <select
                id="k-kind"
                className={selectClass}
                value={kind}
                onChange={(e) =>
                  isKind(e.target.value) && setKind(e.target.value)
                }
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>

            {addError && <p className="text-sm text-danger">{addError}</p>}

            <Button
              type="submit"
              disabled={adding || !title.trim() || !content.trim()}
            >
              {adding ? "Adding…" : "Add entry"}
            </Button>
          </form>
        </CardBody>
      </Card>

      <div className="mt-10 space-y-4">
        {loading && <p className="text-sm text-muted">Loading…</p>}
        {loadError && <p className="text-sm text-danger">{loadError}</p>}

        {!loading && !loadError && entries.length === 0 && (
          <Card>
            <CardBody className="p-8 text-center">
              <h2 className="text-base font-medium text-ink">
                No knowledge yet
              </h2>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
                Add your first entry above. Your assistant will use these to
                answer customer questions accurately.
              </p>
            </CardBody>
          </Card>
        )}

        {entries.map((entry) => (
          <KnowledgeItem
            key={entry.id}
            entry={entry}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        ))}
      </div>
    </div>
  );
}

function KnowledgeItem({
  entry,
  onSaved,
  onDeleted,
}: {
  entry: KnowledgeSource;
  onSaved: (updated: KnowledgeSource) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(entry.title);
  const [content, setContent] = useState(entry.content);
  const [kind, setKind] = useState<KnowledgeKind>(entry.kind);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setTitle(entry.title);
    setContent(entry.content);
    setKind(entry.kind);
    setError(null);
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/knowledge/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          kind,
        }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Failed to save."));
      const updated = toEntry(await res.json());
      if (updated) onSaved(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this entry? This cannot be undone.")) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/knowledge/${entry.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Failed to delete."));
      onDeleted(entry.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <Card>
        <CardBody className="p-6">
          <form onSubmit={handleSave} className="space-y-5">
            <Field label="Title" htmlFor={`edit-title-${entry.id}`}>
              <Input
                id={`edit-title-${entry.id}`}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="Content" htmlFor={`edit-content-${entry.id}`}>
              <Textarea
                id={`edit-content-${entry.id}`}
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </Field>
            <Field label="Kind" htmlFor={`edit-kind-${entry.id}`}>
              <select
                id={`edit-kind-${entry.id}`}
                className={selectClass}
                value={kind}
                onChange={(e) =>
                  isKind(e.target.value) && setKind(e.target.value)
                }
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                size="sm"
                disabled={saving || !title.trim() || !content.trim()}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className={cn(busy && "opacity-50")}>
      <CardBody className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-medium text-ink">
                {entry.title}
              </h3>
              <Badge variant={KIND_VARIANT[entry.kind]}>
                {KIND_LABEL[entry.kind]}
              </Badge>
            </div>
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">
              {entry.content}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={startEdit}
              disabled={busy}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={busy}
            >
              Delete
            </Button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </CardBody>
    </Card>
  );
}
