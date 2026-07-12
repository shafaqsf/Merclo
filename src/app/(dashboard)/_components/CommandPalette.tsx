"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Reset the query whenever the palette is opened.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
  }, [open]);

  // Debounced fetch against /api/search.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const id = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("search failed");
        const json = (await res.json()) as { results?: SearchResult[] };
        setResults(json.results ?? []);
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

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const grouped = useMemo(() => {
    const bots = results.filter((r) => r.type === "bot");
    const conversations = results.filter((r) => r.type === "conversation");
    return [
      { title: "Bots", items: bots },
      { title: "Conversations", items: conversations },
    ].filter((g) => g.items.length > 0);
  }, [results]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title="Search"
      description="Search bots and conversations"
    >
      {/* The list is already filtered server-side; disable cmdk's own filtering. */}
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search bots and conversations…"
        />
        <CommandList>
          {grouped.length === 0 ? (
            <CommandEmpty>
              {loading ? "Searching…" : "No results."}
            </CommandEmpty>
          ) : (
            grouped.map((group) => (
              <CommandGroup key={group.title} heading={group.title}>
                {group.items.map((item) => (
                  <CommandItem
                    key={`${item.type}-${item.id}`}
                    value={`${item.type}-${item.id}-${item.label}`}
                    onSelect={() => go(item.href)}
                    className="justify-between gap-3"
                  >
                    <span className="min-w-0 truncate text-sm font-medium">
                      {item.label}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {item.sublabel}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
