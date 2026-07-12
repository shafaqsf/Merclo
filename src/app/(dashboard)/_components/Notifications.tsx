"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface SearchResult {
  type: "bot" | "conversation";
  id: string;
  label: string;
  sublabel: string;
  href: string;
}

export default function Notifications({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
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
      } catch {
        if (!controller.signal.aborted) setItems([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 0);
    return () => {
      controller.abort();
      window.clearTimeout(id);
    };
  }, [open]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[var(--shadow-lg)]"
      role="menu"
      aria-label="Recent activity"
    >
      <div className="border-b border-hairline px-4 py-3">
        <p className="text-sm font-semibold text-ink">Recent activity</p>
      </div>
      <div className="max-h-80 overflow-y-auto p-2">
        {loading ? (
          <p className="px-3 py-6 text-center text-sm text-faint">Loading…</p>
        ) : items.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-sm font-medium text-ink">You&apos;re all caught up</p>
            <p className="mt-1 text-xs text-muted">
              New conversations will show up here.
            </p>
          </div>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 truncate text-sm text-ink">
                    {item.label}
                  </span>
                  <span className="shrink-0 text-xs capitalize text-faint">
                    {item.sublabel}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
