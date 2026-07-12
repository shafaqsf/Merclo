"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ALL_TOOL_NAMES, TOOL_DEFINITIONS } from "@/lib/tools/schema";
import { buildEmbedSnippet } from "@/lib/embed";
import type { Bot } from "@/lib/db/bots";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { BotTabs } from "./_components/BotTabs";
import { cn } from "@/lib/cn";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function EditBotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [allowedTools, setAllowedTools] = useState<string[]>([]);
  const [originsText, setOriginsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bots/${id}`);
        if (!res.ok) throw new Error("Failed to load bot.");
        const bot: Bot = await res.json();
        if (cancelled) return;
        setName(bot.name);
        setPersona(bot.persona);
        setAllowedTools(bot.allowed_tools);
        setOriginsText(bot.allowed_origins.join(", "));
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load bot.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  function toggleTool(tool: string) {
    setAllowedTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/bots/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          persona: persona.trim(),
          allowed_tools: allowedTools,
          allowed_origins: originsText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save.");
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this bot? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/bots/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete.");
      router.push("/dashboard/bots");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  const snippet = buildEmbedSnippet(id, APP_URL);

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-12 text-sm text-muted">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <Link
        href="/dashboard/bots"
        className="text-sm text-muted transition-colors hover:text-ink"
      >
        &larr; Back to bots
      </Link>

      <div className="mt-5 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Edit bot
        </h1>
        <ButtonLink
          href={`/dashboard/bots/${id}/playground`}
          variant="secondary"
        >
          Test in playground
        </ButtonLink>
      </div>

      <div className="mt-6">
        <BotTabs botId={id} active="settings" />
      </div>

      <form onSubmit={handleSave} className="mt-8 space-y-6">
        <Card>
          <CardBody className="space-y-6 p-8">
            <Field label="Name" htmlFor="name">
              <Input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <Field label="Persona / instructions" htmlFor="persona">
              <Textarea
                id="persona"
                rows={5}
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
              />
            </Field>

            <Field
              label="Allowed storefront origins"
              htmlFor="origins"
              hint="Comma-separated. The chat endpoint rejects requests from origins not listed here. Leave empty to allow any origin (development only)."
            >
              <Input
                id="origins"
                type="text"
                value={originsText}
                onChange={(e) => setOriginsText(e.target.value)}
                placeholder="https://my-store.myshopify.com, https://mystore.com"
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium text-ink">Allowed tools</h2>
            <p className="mt-0.5 text-xs text-muted">
              Choose which actions this assistant can perform.
            </p>
          </CardHeader>
          <CardBody className="p-3">
            <div className="space-y-1">
              {ALL_TOOL_NAMES.map((tool) => {
                const def = TOOL_DEFINITIONS[tool];
                const active = allowedTools.includes(tool);
                return (
                  <label
                    key={tool}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl px-4 py-3 transition-colors",
                      active ? "bg-accent-soft" : "hover:bg-surface-2"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggleTool(tool)}
                      className="mt-0.5 h-4 w-4 accent-[color:var(--accent)]"
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-ink">
                          {tool}
                        </span>
                        {def.mutating && (
                          <Badge tone="warning">mutating</Badge>
                        )}
                      </span>
                      <span className="mt-1 block text-xs text-muted">
                        {def.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </CardBody>
        </Card>

        {error && <p className="text-sm text-danger">{error}</p>}
        {saved && (
          <p className="text-sm text-[color:var(--success)]">Saved.</p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <Button type="button" variant="danger" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </form>

      <Card className="mt-12">
        <CardHeader>
          <h2 className="text-sm font-medium text-ink">Embed snippet</h2>
          <p className="mt-0.5 text-xs text-muted">
            Paste this into your Shopify theme (e.g. before{" "}
            <code>&lt;/body&gt;</code> in <code>theme.liquid</code>).
          </p>
        </CardHeader>
        <CardBody className="space-y-3 p-5">
          <pre className="overflow-x-auto rounded-xl bg-[#1d1d1f] px-4 py-3.5 text-xs leading-relaxed text-[#f5f5f7]">
            <code>{snippet}</code>
          </pre>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={copySnippet}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
