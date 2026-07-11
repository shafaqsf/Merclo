"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ALL_TOOL_NAMES, TOOL_DEFINITIONS } from "@/lib/tools/schema";
import { buildEmbedSnippet } from "@/lib/embed";
import type { Bot } from "@/lib/db/bots";

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
      <div className="mx-auto w-full max-w-2xl px-6 py-10 text-sm text-zinc-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link
        href="/dashboard/bots"
        className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-200"
      >
        &larr; Back to bots
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Edit bot
        </h1>
        <Link
          href={`/dashboard/bots/${id}/playground`}
          className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          Test in playground
        </Link>
      </div>

      <form onSubmit={handleSave} className="mt-8 space-y-6">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Name
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>

        <div>
          <label
            htmlFor="persona"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Persona / instructions
          </label>
          <textarea
            id="persona"
            rows={5}
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            className="mt-1.5 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Allowed tools
          </legend>
          <div className="mt-2 space-y-2">
            {ALL_TOOL_NAMES.map((tool) => {
              const def = TOOL_DEFINITIONS[tool];
              return (
                <label
                  key={tool}
                  className="flex items-start gap-2.5 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                >
                  <input
                    type="checkbox"
                    checked={allowedTools.includes(tool)}
                    onChange={() => toggleTool(tool)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-mono text-xs text-zinc-900 dark:text-zinc-100">
                      {tool}
                      {def.mutating && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          mutating
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-zinc-500">
                      {def.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label
            htmlFor="origins"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Allowed storefront origins{" "}
            <span className="font-normal text-zinc-400">(comma-separated)</span>
          </label>
          <input
            id="origins"
            type="text"
            value={originsText}
            onChange={(e) => setOriginsText(e.target.value)}
            placeholder="https://my-store.myshopify.com, https://mystore.com"
            className="mt-1.5 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <p className="mt-1 text-xs text-zinc-500">
            The chat endpoint rejects requests from origins not listed here.
            Leave empty to allow any origin (development only).
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        {saved && (
          <p className="text-sm text-green-600 dark:text-green-400">Saved.</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex h-9 items-center rounded-md border border-red-300 px-4 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            Delete
          </button>
        </div>
      </form>

      <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Embed snippet
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Paste this into your Shopify theme (e.g. before{" "}
          <code>&lt;/body&gt;</code> in <code>theme.liquid</code>).
        </p>
        <div className="mt-3 flex items-start gap-2">
          <pre className="flex-1 overflow-x-auto rounded-md bg-zinc-950 px-3 py-2.5 text-xs text-zinc-100">
            <code>{snippet}</code>
          </pre>
          <button
            type="button"
            onClick={copySnippet}
            className="inline-flex h-9 shrink-0 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </section>
    </div>
  );
}
