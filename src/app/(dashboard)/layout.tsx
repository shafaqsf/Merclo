import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import SignOutButton from "./_components/SignOutButton";
import NavLinks from "./_components/NavLinks";
import TopBar from "./_components/TopBar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-hairline bg-sidebar text-sidebar-ink">
        <div className="px-6 py-6">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-[15px] font-semibold text-accent-ink">
              M
            </span>
            <span className="text-[17px] font-semibold tracking-tight text-sidebar-ink">
              Merclo
            </span>
          </Link>
        </div>

        <NavLinks />

        <div className="px-4 pb-4">
          <div className="rounded-2xl border border-sidebar-hairline bg-sidebar-surface p-4">
            <p className="text-sm font-semibold text-sidebar-ink">Need help?</p>
            <p className="mt-1 text-xs leading-relaxed text-sidebar-muted">
              Browse the docs or reach out and we&apos;ll get you unblocked.
            </p>
            <Link
              href="/dashboard/settings"
              className="mt-3 inline-flex text-xs font-medium text-accent hover:underline"
            >
              Get support →
            </Link>
          </div>
        </div>

        <div className="border-t border-sidebar-hairline p-3">
          <p className="mb-1 truncate px-3 text-xs text-sidebar-muted">
            {user.email}
          </p>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar userEmail={user.email ?? ""} />
        <main className="flex-1">
          <div className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
