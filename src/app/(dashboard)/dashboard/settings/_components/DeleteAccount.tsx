"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CONFIRM_PHRASE = "DELETE";

export default function DeleteAccount() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      const data: { ok?: boolean; error?: string } = await res
        .json()
        .catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to delete account.");
      }

      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setDeleting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-red-200 bg-white p-6">
      <h3 className="text-lg font-semibold tracking-tight text-red-700">
        Danger zone
      </h3>
      <p className="mt-1 text-sm text-neutral-500">
        Permanently delete your account, all of your bots, and all of your
        conversations. This action cannot be undone.
      </p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => {
            setConfirming(true);
            setError(null);
          }}
          className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
        >
          Delete account
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-neutral-700">
            Type{" "}
            <span className="font-mono font-semibold text-red-700">
              {CONFIRM_PHRASE}
            </span>{" "}
            to confirm permanent deletion.
          </p>
          <input
            type="text"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="off"
            className="w-full max-w-xs rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
            placeholder={CONFIRM_PHRASE}
          />

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={phrase !== CONFIRM_PHRASE || deleting}
              onClick={handleDelete}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Permanently delete"}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                setConfirming(false);
                setPhrase("");
                setError(null);
              }}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
