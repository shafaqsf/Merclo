"use client";

import { Tabs } from "@/components/ui/Tabs";

/**
 * Shared tab header for a bot's sub-pages (Settings / Appearance / Knowledge).
 * Each page renders <BotTabs botId active="..." /> so the tabs stay consistent
 * without pages editing each other.
 */
export function BotTabs({
  botId,
  active,
}: {
  botId: string;
  active: "settings" | "appearance" | "knowledge";
}) {
  const base = `/dashboard/bots/${botId}`;
  return (
    <Tabs
      items={[
        { label: "Settings", href: base, active: active === "settings" },
        {
          label: "Appearance",
          href: `${base}/appearance`,
          active: active === "appearance",
        },
        {
          label: "Knowledge",
          href: `${base}/knowledge`,
          active: active === "knowledge",
        },
      ]}
    />
  );
}
