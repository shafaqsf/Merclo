import { redirect } from "next/navigation";

// The root path has no standalone content yet — send visitors to the
// dashboard. Unauthenticated users are bounced to /login by the auth proxy.
export default function Home() {
  redirect("/dashboard");
}
