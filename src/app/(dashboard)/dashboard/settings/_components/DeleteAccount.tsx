"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

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
    <Card className="border-danger/30">
      <CardHeader className="border-danger/20 bg-danger-soft">
        <h2 className="text-base font-semibold tracking-tight text-danger">
          Danger zone
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          Permanently delete your account, all of your bots, and all of your
          conversations. This action cannot be undone.
        </p>
      </CardHeader>
      <CardBody>
        {!confirming ? (
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              setConfirming(true);
              setError(null);
            }}
          >
            Delete account
          </Button>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ink">
              Type{" "}
              <span className="font-mono font-semibold text-danger">
                {CONFIRM_PHRASE}
              </span>{" "}
              to confirm permanent deletion.
            </p>
            <Input
              type="text"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
              className="max-w-xs"
              placeholder={CONFIRM_PHRASE}
            />

            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="danger"
                disabled={phrase !== CONFIRM_PHRASE || deleting}
                onClick={handleDelete}
              >
                {deleting ? "Deleting…" : "Permanently delete"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={deleting}
                onClick={() => {
                  setConfirming(false);
                  setPhrase("");
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
