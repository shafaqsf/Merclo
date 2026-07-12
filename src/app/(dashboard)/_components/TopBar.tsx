"use client";

import { useEffect, useState } from "react";
import CommandPalette from "./CommandPalette";
import Notifications from "./Notifications";

export default function TopBar({ userEmail }: { userEmail: string }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const initial = (userEmail.trim()[0] ?? "U").toUpperCase();

  // Global ⌘K / Ctrl+K to toggle the command palette.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-6 sm:px-8">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="group flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-hairline bg-surface px-4 text-sm text-faint transition-colors hover:border-hairline-strong hover:text-muted sm:max-w-sm"
        >
          <svg
            className="h-4 w-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <span className="flex-1 text-left">Search…</span>
          <kbd className="hidden shrink-0 rounded-md border border-hairline bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-faint sm:block">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              aria-label="Notifications"
              onClick={() => setNotifOpen((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-full border border-hairline bg-surface text-muted transition-colors hover:text-ink"
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
            </button>
            <Notifications
              open={notifOpen}
              onClose={() => setNotifOpen(false)}
            />
          </div>

          <div
            className="grid h-9 w-9 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-ink"
            title={userEmail}
            aria-label={userEmail}
          >
            {initial}
          </div>
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </header>
  );
}
