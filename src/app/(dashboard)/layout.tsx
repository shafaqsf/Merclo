import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import SignOutButton from "./_components/SignOutButton";
import NavLinks from "./_components/NavLinks";

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
      <aside className="sticky top-0 flex h-screen w-64 flex-col border-r border-hairline bg-surface-2/70 backdrop-blur-xl">
        <div className="px-6 py-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-[15px] font-semibold text-accent-ink">
              M
            </span>
            <span className="text-[17px] font-semibold tracking-tight">
              Merclo
            </span>
          </Link>
        </div>

        <NavLinks />

        <div className="border-t border-hairline p-3">
          <p className="mb-1 truncate px-3 text-xs text-faint">{user.email}</p>
          <SignOutButton />
        </div>
      </aside>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-5xl px-8 py-10">{children}</div>
      </main>
    </div>
  );
}
