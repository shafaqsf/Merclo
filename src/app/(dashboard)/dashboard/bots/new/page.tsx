"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

export default function NewBotPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), persona: persona.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create bot.");
      }
      const bot = await res.json();
      router.push(`/dashboard/bots/${bot.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link
        href="/dashboard/bots"
        className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-200"
      >
        &larr; Back to bots
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        New bot
      </h1>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
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
            placeholder="Storefront assistant"
            className="mt-1.5 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>

        <div>
          <label
            htmlFor="persona"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Persona{" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <textarea
            id="persona"
            rows={4}
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            placeholder="A friendly, concise shopping assistant that..."
            className="mt-1.5 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {submitting ? "Creating…" : "Create bot"}
          </button>
          <Link
            href="/dashboard/bots"
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-200"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
