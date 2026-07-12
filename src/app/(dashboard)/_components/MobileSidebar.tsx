"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import NavLinks from "./NavLinks";
import SignOutButton from "./SignOutButton";

/**
 * Mobile navigation drawer. Shown only below `lg` (the desktop sidebar is
 * hidden there). A hamburger button opens a left slide-over with the same nav.
 */
export default function MobileSidebar({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer after navigating.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open navigation menu"
          className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <Menu className="size-5" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="flex w-64 flex-col gap-0 bg-sidebar p-0 text-sidebar-foreground"
      >
        <SheetHeader className="px-6 py-6">
          <SheetTitle asChild>
            <Link
              href="/dashboard"
              className="flex items-center gap-2.5 text-left"
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground">
                M
              </span>
              <span className="text-[17px] font-semibold tracking-tight text-sidebar-foreground">
                Merclo
              </span>
            </Link>
          </SheetTitle>
        </SheetHeader>

        <NavLinks />

        <div className="mt-auto border-t border-sidebar-border p-3">
          <p className="mb-1 truncate px-3 text-xs text-muted-foreground">
            {email}
          </p>
          <SignOutButton />
        </div>
      </SheetContent>
    </Sheet>
  );
}
