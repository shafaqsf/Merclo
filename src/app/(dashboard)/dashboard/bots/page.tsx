import Link from "next/link";
import { listBots } from "@/lib/db/bots";

export default async function BotsPage() {
  const bots = await listBots();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Bots
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Manage the assistants you embed on your storefront.
          </p>
        </div>
        <Link
          href="/dashboard/bots/new"
          className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          New bot
        </Link>
      </div>

      {bots.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            You don&apos;t have any bots yet.
          </p>
          <Link
            href="/dashboard/bots/new"
            className="mt-4 inline-flex h-9 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Create your first bot
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {bots.map((bot) => (
            <li key={bot.id}>
              <Link
                href={`/dashboard/bots/${bot.id}`}
                className="flex items-center justify-between px-4 py-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {bot.name}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {bot.allowed_tools.length} tool
                    {bot.allowed_tools.length === 1 ? "" : "s"} enabled
                  </p>
                </div>
                <span className="text-sm text-zinc-400" aria-hidden>
                  &rarr;
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
