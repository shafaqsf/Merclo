"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Shared tab header for a bot's sub-pages (Settings / Appearance / Knowledge).
 * Each page renders <BotTabs botId active="..." /> so the tabs stay consistent
 * without pages editing each other. These navigate between routes, so they are
 * plain links styled as a monochrome segmented control (not the radix Tabs
 * primitive, which drives in-page panels).
 */
export function BotTabs({
  botId,
  active,
}: {
  botId: string;
  active: "settings" | "appearance" | "knowledge";
}) {
  const base = `/dashboard/bots/${botId}`;
  const items: { label: string; href: string; key: typeof active }[] = [
    { label: "Settings", href: base, key: "settings" },
    { label: "Appearance", href: `${base}/appearance`, key: "appearance" },
    { label: "Knowledge", href: `${base}/knowledge`, key: "knowledge" },
  ];

  return (
    <nav className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
