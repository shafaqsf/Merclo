"use client";

import { useEffect, useState } from "react";
import CommandPalette from "./CommandPalette";
import Notifications from "./Notifications";
import MobileSidebar from "./MobileSidebar";
import { Button } from "@/components/ui/button";

export default function TopBar({ userEmail }: { userEmail: string }) {
  const [paletteOpen, setPaletteOpen] = useState(false);

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
    <header className="sticky top-0 z-30 border-b border-border bg-background">
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-3 px-4 sm:px-10">
        <MobileSidebar email={userEmail} />
        <Button
          type="button"
          variant="outline"
          onClick={() => setPaletteOpen(true)}
          className="group h-10 min-w-0 flex-1 justify-start gap-2.5 rounded-lg px-4 font-normal text-muted-foreground sm:max-w-md"
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
        </Button>

        <div className="ml-auto flex items-center gap-2.5">
          <Notifications />
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
}
