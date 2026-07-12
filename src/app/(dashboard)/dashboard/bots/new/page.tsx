"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/Field";

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
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <Link
        href="/dashboard/bots"
        className="text-sm text-foreground transition-colors hover:text-ink"
      >
        &larr; Back to bots
      </Link>

      <h1 className="mt-5 text-3xl font-semibold tracking-tight text-ink">
        New bot
      </h1>
      <p className="mt-2 text-sm text-foreground">
        Give your assistant a name and an optional persona to get started.
      </p>

      <Card className="mt-8">
        <CardBody className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <Field label="Name" htmlFor="name">
              <Input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Storefront assistant"
              />
            </Field>

            <Field label="Persona" htmlFor="persona" hint="Optional">
              <Textarea
                id="persona"
                rows={4}
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                placeholder="A friendly, concise shopping assistant that..."
              />
            </Field>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" disabled={submitting || !name.trim()}>
                {submitting ? "Creating…" : "Create bot"}
              </Button>
              <ButtonLink href="/dashboard/bots" variant="ghost">
                Cancel
              </ButtonLink>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
