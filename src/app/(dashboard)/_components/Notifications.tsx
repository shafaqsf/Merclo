"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface SearchResult {
  type: "bot" | "conversation";
  id: string;
  label: string;
  sublabel: string;
  href: string;
}

export default function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Load a few recent conversations (empty query) when opened.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    // Deferred so setState isn't called synchronously within the effect body.
    const id = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/search?q=", {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("failed");
        const json = (await res.json()) as { results?: SearchResult[] };
        const recent = (json.results ?? [])
          .filter((r) => r.type === "conversation")
          .slice(0, 5);
        setItems(recent);
      } catch (err) {
        // Ignore aborts (panel closed / re-opened before the request settled).
        if ((err as Error)?.name === "AbortError" || controller.signal.aborted) {
          return;
        }
        setItems([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 0);
    return () => {
      controller.abort(new DOMException("closed", "AbortError"));
      window.clearTimeout(id);
    };
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Notifications"
          className="size-10 rounded-lg text-muted-foreground hover:text-foreground"
        >
          <svg
            className="h-[18px] w-[18px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path
              d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M13.7 21a2 2 0 0 1-3.4 0"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 overflow-hidden p-0"
        aria-label="Recent activity"
      >
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-foreground">
            Recent activity
          </p>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {loading ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : items.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                You&apos;re all caught up
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                New conversations will show up here.
              </p>
            </div>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-muted"
                  >
                    <span className="min-w-0 truncate text-sm text-foreground">
                      {item.label}
                    </span>
                    <span className="shrink-0 text-xs capitalize text-muted-foreground">
                      {item.sublabel}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
