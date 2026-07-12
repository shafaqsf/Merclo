import { redirect } from "next/navigation";

// The root path has no standalone content yet — send visitors straight to
// the dashboard (this is a single-tenant, no-login tool).
export default function Home() {
  redirect("/dashboard");
}
