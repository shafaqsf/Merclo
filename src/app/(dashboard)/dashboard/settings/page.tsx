import { Card, CardHeader, CardBody } from "@/components/ui/Card";

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Settings
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          This is a self-hosted, single-tenant instance — there is no account
          or login to manage.
        </p>
      </header>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold tracking-tight text-ink">
            About
          </h2>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-muted">
            Merclo runs without authentication. Configuration (Supabase and
            OpenRouter credentials) lives in your environment variables — see{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
              .env.example
            </code>
            .
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
