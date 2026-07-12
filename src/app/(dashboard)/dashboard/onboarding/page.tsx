"use client";

import * as React from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { buildEmbedSnippet } from "@/lib/embed";
import { cn } from "@/lib/cn";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const STEPS = ["Create bot", "Install widget", "Try it out"] as const;

interface CreatedBot {
  id: string;
}

function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="flex items-center justify-center gap-3">
      {STEPS.map((label, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <li key={label} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-medium transition-colors",
                  active && "bg-accent text-accent-ink",
                  done && "bg-accent-soft text-accent",
                  !active && !done && "bg-surface-2 text-faint"
                )}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={cn(
                  "hidden text-[13px] font-medium sm:block",
                  active ? "text-ink" : "text-faint"
                )}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span className="h-px w-6 bg-hairline" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function OnboardingPage() {
  const [step, setStep] = React.useState(0);
  const [botId, setBotId] = React.useState<string | null>(null);

  const [name, setName] = React.useState("");
  const [persona, setPersona] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  // Guard: steps 2/3 require a botId.
  const activeStep = step > 0 && !botId ? 0 : step;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          persona: persona.trim() || undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      const bot: CreatedBot = await res.json();
      if (!bot?.id) throw new Error("Malformed response from server.");
      setBotId(bot.id);
      setStep(1);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!botId) return;
    try {
      await navigator.clipboard.writeText(buildEmbedSnippet(botId, APP_URL));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-10 px-4 py-12">
      <header className="space-y-4 text-center">
        <StepIndicator current={activeStep} />
        <div className="space-y-1.5">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
            {activeStep === 0 && "Create your first bot"}
            {activeStep === 1 && "Install the widget"}
            {activeStep === 2 && "Try it out"}
          </h1>
          <p className="text-sm text-muted">
            {activeStep === 0 &&
              "Give your assistant a name and personality to get started."}
            {activeStep === 1 &&
              "Add the widget to your storefront in one snippet."}
            {activeStep === 2 &&
              "See your bot in action before you go live."}
          </p>
        </div>
      </header>

      {activeStep === 0 && (
        <Card>
          <CardBody className="space-y-6 p-8">
            <form onSubmit={handleCreate} className="space-y-5">
              <Field
                label="Bot name"
                htmlFor="bot-name"
                hint="This is shown to your customers in the chat header."
              >
                <Input
                  id="bot-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Merclo Assistant"
                  autoFocus
                  required
                />
              </Field>
              <Field
                label="Persona"
                htmlFor="bot-persona"
                hint="Optional — describe the tone and role your bot should adopt."
              >
                <Textarea
                  id="bot-persona"
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  placeholder="A friendly, concise shopping assistant for a premium apparel store."
                  rows={4}
                />
              </Field>

              {error && (
                <p className="text-sm text-danger" role="alert">
                  {error}
                </p>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={!name.trim() || submitting}>
                  {submitting ? "Creating…" : "Create bot"}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {activeStep === 1 && botId && (
        <Card>
          <CardBody className="space-y-6 p-8">
            <div className="space-y-2">
              <p className="text-sm text-muted">
                Paste this snippet into your Shopify theme, just before the
                closing <code className="text-ink">&lt;/body&gt;</code> tag.
              </p>
              <div className="relative">
                <pre className="overflow-x-auto rounded-xl bg-[#1d1d1f] px-4 py-4 text-[13px] leading-relaxed text-[#f5f5f7]">
                  <code>{buildEmbedSnippet(botId, APP_URL)}</code>
                </pre>
                <div className="absolute right-3 top-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    type="button"
                    onClick={handleCopy}
                  >
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-hairline pt-6">
              <ButtonLink
                variant="ghost"
                size="sm"
                href={`/dashboard/bots/${botId}/appearance`}
              >
                Customize appearance
              </ButtonLink>
              <Button type="button" onClick={() => setStep(2)}>
                Continue
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {activeStep === 2 && botId && (
        <Card>
          <CardBody className="space-y-6 p-8">
            <p className="text-sm leading-relaxed text-muted">
              The Playground is a private sandbox where you can chat with your
              bot exactly as your customers will — test its persona, refine its
              answers, and make sure everything feels right before it goes live.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <ButtonLink href={`/dashboard/bots/${botId}/playground`}>
                Open playground
              </ButtonLink>
              <ButtonLink href="/dashboard" variant="secondary">
                Go to dashboard
              </ButtonLink>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
