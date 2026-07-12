import Link from "next/link";
import { listBots } from "@/lib/db/bots";
import { Card, CardBody } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

export default async function BotsPage() {
  const bots = await listBots();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="mb-10 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
            Bots
          </h1>
          <p className="mt-2 text-sm text-muted">
            Manage the assistants you embed on your storefront.
          </p>
        </div>
        <ButtonLink href="/dashboard/bots/new">New bot</ButtonLink>
      </div>

      {bots.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <div>
              <p className="text-base font-medium text-ink">No bots yet</p>
              <p className="mt-1 text-sm text-muted">
                Create your first assistant to embed on your storefront.
              </p>
            </div>
            <ButtonLink href="/dashboard/bots/new">New bot</ButtonLink>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {bots.map((bot) => (
            <Link
              key={bot.id}
              href={`/dashboard/bots/${bot.id}`}
              className="group block"
            >
              <Card className="transition-all duration-200 hover:border-hairline-strong hover:shadow-[var(--shadow-md)]">
                <CardBody className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{bot.name}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {bot.allowed_tools.length} tool
                      {bot.allowed_tools.length === 1 ? "" : "s"} &middot;{" "}
                      {bot.allowed_origins.length} origin
                      {bot.allowed_origins.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span
                    className="flex shrink-0 items-center gap-1 text-sm text-faint transition-colors group-hover:text-foreground"
                    aria-hidden
                  >
                    Edit
                    <span className="transition-transform duration-200 group-hover:translate-x-0.5">
                      &rsaquo;
                    </span>
                  </span>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
