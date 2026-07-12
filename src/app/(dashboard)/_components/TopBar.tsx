"use client";

import { useEffect, useState } from "react";
import CommandPalette from "./CommandPalette";
import Notifications from "./Notifications";

export default function TopBar({ userEmail }: { userEmail: string }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const initial = (userEmail.trim()[0] ?? "U").toUpperCase();
  const name = userEmail.split("@")[0] || "Account";

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
    <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/70 backdrop-blur-2xl backdrop-saturate-150">
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-3 px-6 sm:px-10">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="glass-panel glass-interactive group flex h-10 min-w-0 flex-1 items-center gap-2.5 !rounded-xl px-4 text-sm text-faint hover:border-hairline-strong hover:text-muted sm:max-w-md"
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
          <span className="flex-1 text-left">Search for anything…</span>
          <kbd className="hidden shrink-0 rounded-md border border-hairline bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-faint sm:block">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-2.5">
          <div className="relative">
            <button
              type="button"
              aria-label="Notifications"
              onClick={() => setNotifOpen((v) => !v)}
              className="glass-panel glass-interactive relative grid h-10 w-10 place-items-center !rounded-xl text-muted hover:text-ink"
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
            className="glass-panel flex items-center gap-2.5 !rounded-xl py-1.5 pl-1.5 pr-3"
            title={userEmail}
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-semibold text-accent-ink">
              {initial}
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block max-w-[10rem] truncate text-[13px] font-semibold capitalize text-ink">
                {name}
              </span>
              <span className="block text-[11px] text-faint">Owner</span>
            </span>
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
