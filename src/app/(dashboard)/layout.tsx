import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import SignOutButton from "./_components/SignOutButton";
import NavLinks from "./_components/NavLinks";
import TopBar from "./_components/TopBar";
import CopilotProvider from "./_components/CopilotProvider";
import CopilotPanel from "./_components/CopilotPanel";

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

  const email = user.email ?? "";

  return (
    <CopilotProvider>
      <div className="flex min-h-screen bg-background text-foreground">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
          <div className="flex h-16 items-center border-b border-sidebar-border px-6">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground">
                M
              </span>
              <span className="text-[17px] font-semibold tracking-tight text-sidebar-foreground">
                Merclo
              </span>
            </Link>
          </div>

          <NavLinks />

          <div className="mt-auto border-t border-sidebar-border p-3">
            <p className="mb-1 truncate px-3 text-xs text-muted-foreground">
              {email}
            </p>
            <SignOutButton />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar userEmail={email} />
          <main className="flex-1">
            <div className="mx-auto w-full max-w-[1600px] px-6 py-8 sm:px-10">
              {children}
            </div>
          </main>
        </div>

        <CopilotPanel />
      </div>
    </CopilotProvider>
  );
}
