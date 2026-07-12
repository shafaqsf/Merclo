"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CommandPalette from "./CommandPalette";
import Notifications from "./Notifications";
import MobileSidebar from "./MobileSidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createBrowserSupabase } from "@/lib/supabase/client";

export default function TopBar({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);

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

  async function handleSignOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={userEmail}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-card py-1.5 pl-1.5 pr-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                    {initial}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden leading-tight sm:block">
                  <span className="block max-w-[10rem] truncate text-[13px] font-semibold capitalize text-foreground">
                    {name}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    Owner
                  </span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                {userEmail}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => handleSignOut()}>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
}
