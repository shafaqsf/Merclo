"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

interface SearchResult {
  type: "bot" | "conversation";
  id: string;
  label: string;
  sublabel: string;
  href: string;
}

export default function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  // Reset state whenever the palette is opened and focus the input. The state
  // resets run inside the timeout (not synchronously in the effect body).
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      setQuery("");
      setResults([]);
      setActive(0);
      inputRef.current?.focus();
    }, 20);
    return () => window.clearTimeout(id);
  }, [open]);

  // Debounced fetch against /api/search.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const id = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error("search failed");
        const json = (await res.json()) as { results?: SearchResult[] };
        setResults(json.results ?? []);
        setActive(0);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(id);
    };
  }, [query, open]);

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router]
  );

  const grouped = useMemo(() => {
    const bots = results.filter((r) => r.type === "bot");
    const conversations = results.filter((r) => r.type === "conversation");
    return [
      { title: "Bots", items: bots },
      { title: "Conversations", items: conversations },
    ].filter((g) => g.items.length > 0);
  }, [results]);

  // Flatten to a single navigable list for arrow/enter handling.
  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flat[active];
      if (item) go(item.href);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[var(--shadow-lg)]"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-hairline px-4">
          <svg
            className="h-4 w-4 shrink-0 text-faint"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search bots and conversations…"
            className="h-14 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
          />
          <kbd className="hidden shrink-0 rounded-md border border-hairline bg-surface-2 px-1.5 py-0.5 text-[11px] text-faint sm:block">
            Esc
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {loading && flat.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-faint">Searching…</p>
          ) : flat.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-faint">
              No results.
            </p>
          ) : (
            grouped.map((group) => (
              <div key={group.title} className="mb-1">
                <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">
                  {group.title}
                </p>
                <ul>
                  {group.items.map((item) => {
                    const idx = flat.indexOf(item);
                    const isActive = idx === active;
                    return (
                      <li key={`${item.type}-${item.id}`}>
                        <button
                          type="button"
                          onMouseEnter={() => setActive(idx)}
                          onClick={() => go(item.href)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                            isActive ? "bg-accent-soft" : "hover:bg-surface-2"
                          )}
                        >
                          <span className="min-w-0 truncate text-sm font-medium text-ink">
                            {item.label}
                          </span>
                          <span className="shrink-0 text-xs text-faint">
                            {item.sublabel}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
