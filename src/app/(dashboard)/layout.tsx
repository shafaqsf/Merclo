import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import SignOutButton from "./_components/SignOutButton";

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
    <div className="flex min-h-screen bg-neutral-50 text-neutral-900">
      <aside className="flex w-60 flex-col border-r border-neutral-200 bg-white">
        <div className="px-6 py-5">
          <span className="text-lg font-semibold tracking-tight">Merclo</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          <Link
            href="/dashboard"
            className="block rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/bots"
            className="block rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
          >
            Bots
          </Link>
          <Link
            href="/dashboard/conversations"
            className="block rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
          >
            Conversations
          </Link>
          <Link
            href="/dashboard/settings"
            className="block rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
          >
            Settings
          </Link>
        </nav>
        <div className="border-t border-neutral-200 p-3">
          <p className="mb-2 truncate px-3 text-xs text-neutral-500">
            {user.email}
          </p>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center border-b border-neutral-200 bg-white px-6">
          <h1 className="text-sm font-medium text-neutral-500">Dashboard</h1>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
