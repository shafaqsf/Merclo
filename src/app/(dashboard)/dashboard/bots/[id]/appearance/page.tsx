"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  resolveAppearance,
  type WidgetAppearance,
} from "@/lib/bots/appearance";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Switch } from "@/components/ui/Switch";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { BotTabs } from "../_components/BotTabs";
import { WidgetPreview } from "../_components/WidgetPreview";
import { AvatarUpload } from "./_components/AvatarUpload";

const selectClass =
  "w-full rounded-xl border border-hairline bg-surface-2 px-3.5 py-2.5 text-sm " +
  "text-ink transition-colors outline-none focus:border-accent focus:bg-surface";

export default function AppearancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [state, setState] = useState<WidgetAppearance>(() =>
    resolveAppearance({})
  );
  const [quickRepliesText, setQuickRepliesText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bots/${id}`);
        if (!res.ok) throw new Error("Failed to load bot.");
        const bot: { name?: string; appearance?: unknown } = await res.json();
        if (cancelled) return;
        const appearance = resolveAppearance(bot.appearance);
        setName(bot.name ?? "");
        setState(appearance);
        setQuickRepliesText(appearance.quickReplies.join("\n"));
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

  function update<K extends keyof WidgetAppearance>(
    key: K,
    value: WidgetAppearance[K]
  ) {
    setState((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function updateProactive<K extends keyof WidgetAppearance["proactive"]>(
    key: K,
    value: WidgetAppearance["proactive"][K]
  ) {
    setState((prev) => ({
      ...prev,
      proactive: { ...prev.proactive, [key]: value },
    }));
    setSaved(false);
  }

  function updateTheme<K extends keyof WidgetAppearance["theme"]>(
    key: K,
    value: WidgetAppearance["theme"][K]
  ) {
    setState((prev) => ({
      ...prev,
      theme: { ...prev.theme, [key]: value },
    }));
    setSaved(false);
  }

  function parseQuickReplies(text: string): string[] {
    return text
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    const appearance: WidgetAppearance = {
      ...state,
      quickReplies: parseQuickReplies(quickRepliesText),
    };
    try {
      const res = await fetch(`/api/bots/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appearance }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save.");
      }
      setState(appearance);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-12 text-sm text-muted">
        Loading…
      </div>
    );
  }

  const previewState: WidgetAppearance = {
    ...state,
    quickReplies: parseQuickReplies(quickRepliesText),
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <Link
        href="/dashboard/bots"
        className="text-sm text-muted transition-colors hover:text-ink"
      >
        &larr; Back to bots
      </Link>

      <div className="mt-5">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Appearance
        </h1>
        {name && (
          <p className="mt-1 text-sm text-muted">Customize the widget for {name}.</p>
        )}
      </div>

      <div className="mt-6">
        <BotTabs botId={id} active="appearance" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* LEFT: form */}
        <form onSubmit={handleSave} className="space-y-6">
          <Card>
            <CardBody className="space-y-5 p-6">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Accent color" htmlFor="accent">
                  <div className="flex items-center gap-2">
                    <input
                      id="accent"
                      type="color"
                      value={state.accent}
                      onChange={(e) => update("accent", e.target.value)}
                      className="h-10 w-14 cursor-pointer rounded-lg border border-hairline bg-surface-2"
                    />
                    <Input
                      type="text"
                      value={state.accent}
                      onChange={(e) => update("accent", e.target.value)}
                    />
                  </div>
                </Field>

                <Field label="Position" htmlFor="position">
                  <select
                    id="position"
                    value={state.position}
                    onChange={(e) =>
                      update(
                        "position",
                        e.target.value === "left" ? "left" : "right"
                      )
                    }
                    className={selectClass}
                  >
                    <option value="right">Right</option>
                    <option value="left">Left</option>
                  </select>
                </Field>
              </div>

              <Field label="Launcher icon" htmlFor="launcher">
                <select
                  id="launcher"
                  value={state.launcher}
                  onChange={(e) => {
                    const v = e.target.value;
                    update(
                      "launcher",
                      v === "sparkle" || v === "cart" ? v : "chat"
                    );
                  }}
                  className={selectClass}
                >
                  <option value="chat">Chat</option>
                  <option value="sparkle">Sparkle</option>
                  <option value="cart">Cart</option>
                </select>
              </Field>

              <Field label="Title" htmlFor="title">
                <Input
                  id="title"
                  type="text"
                  value={state.title}
                  onChange={(e) => update("title", e.target.value)}
                />
              </Field>

              <Field label="Subtitle" htmlFor="subtitle">
                <Input
                  id="subtitle"
                  type="text"
                  value={state.subtitle}
                  onChange={(e) => update("subtitle", e.target.value)}
                />
              </Field>

              <Field label="Greeting" htmlFor="greeting">
                <Textarea
                  id="greeting"
                  rows={2}
                  value={state.greeting}
                  onChange={(e) => update("greeting", e.target.value)}
                />
              </Field>

              <Field
                label="Quick replies"
                htmlFor="quickReplies"
                hint="One per line (or comma-separated). Up to 6 shown as tappable chips."
              >
                <Textarea
                  id="quickReplies"
                  rows={3}
                  value={quickRepliesText}
                  onChange={(e) => {
                    setQuickRepliesText(e.target.value);
                    setSaved(false);
                  }}
                  placeholder={"Track my order\nReturn policy\nFind a gift"}
                />
              </Field>

              <Switch
                id="showProductCards"
                checked={state.showProductCards}
                onChange={(checked) => update("showProductCards", checked)}
                label="Show product cards in chat"
              />
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-5 p-6">
              <Field label="Avatar / logo" hint="Shown in the chat header and launcher button.">
                <AvatarUpload
                  botId={id}
                  value={state.avatarUrl}
                  onChange={(url) => update("avatarUrl", url)}
                />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-5 p-6">
              <Field label="Shape">
                <SegmentedControl
                  value={state.theme.shape}
                  onChange={(v) => updateTheme("shape", v)}
                  options={[
                    { value: "rounded", label: "Rounded" },
                    { value: "sharp", label: "Sharp" },
                  ]}
                />
              </Field>

              <Field label="Density">
                <SegmentedControl
                  value={state.theme.density}
                  onChange={(v) => updateTheme("density", v)}
                  options={[
                    { value: "compact", label: "Compact" },
                    { value: "spacious", label: "Spacious" },
                  ]}
                />
              </Field>

              <Field label="Dark mode">
                <SegmentedControl
                  value={state.darkMode}
                  onChange={(v) => update("darkMode", v)}
                  options={[
                    { value: "auto", label: "Auto" },
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                  ]}
                />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-5 p-6">
              <Switch
                id="proactiveEnabled"
                checked={state.proactive.enabled}
                onChange={(checked) => updateProactive("enabled", checked)}
                label={<span className="font-medium">Proactive greeting</span>}
              />

              <Field
                label="Delay (ms)"
                htmlFor="delayMs"
                hint="How long to wait before showing the nudge."
              >
                <Input
                  id="delayMs"
                  type="number"
                  min={0}
                  max={120000}
                  value={state.proactive.delayMs}
                  onChange={(e) =>
                    updateProactive(
                      "delayMs",
                      Number.isFinite(e.target.valueAsNumber)
                        ? e.target.valueAsNumber
                        : 0
                    )
                  }
                  disabled={!state.proactive.enabled}
                />
              </Field>

              <Field label="Nudge message" htmlFor="proactiveMessage">
                <Input
                  id="proactiveMessage"
                  type="text"
                  value={state.proactive.message}
                  onChange={(e) => updateProactive("message", e.target.value)}
                  disabled={!state.proactive.enabled}
                />
              </Field>
            </CardBody>
          </Card>

          {error && <p className="text-sm text-danger">{error}</p>}
          {saved && (
            <p className="text-sm text-[color:var(--success)]">Saved.</p>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save appearance"}
            </Button>
          </div>
        </form>

        {/* RIGHT: live preview */}
        <div>
          <WidgetPreview appearance={previewState} />
        </div>
      </div>
    </div>
  );
}
