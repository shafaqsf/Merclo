"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

export interface TabItem {
  label: string;
  href: string;
  active?: boolean;
}

/** Underline-style tab bar for section navigation (e.g. bot editor). */
export function Tabs({ items }: { items: TabItem[] }) {
  return (
    <div className="flex gap-1 border-b border-hairline">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "relative px-3 py-2.5 text-sm font-medium transition-colors",
            t.active
              ? "text-ink"
              : "text-muted hover:text-ink"
          )}
        >
          {t.label}
          {t.active && (
            <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
          )}
        </Link>
      ))}
    </div>
  );
}
