"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const CONFIRM_PHRASE = "DELETE";

export default function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
    <Card className="border-destructive/40">
      <CardHeader>
        <h2 className="text-base font-semibold tracking-tight text-destructive">
          Danger zone
        </h2>
        <p className="mt-1 text-sm text-foreground">
          Permanently delete your account, all of your bots, and all of your
          conversations. This action cannot be undone.
        </p>
      </CardHeader>
      <CardBody>
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) {
              setPhrase("");
              setError(null);
            }
          }}
        >
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive">
              Delete account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete account?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes your account, all of your bots, and all
                of your conversations. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-3">
              <p className="text-sm text-ink">
                Type{" "}
                <span className="font-mono font-semibold text-destructive">
                  {CONFIRM_PHRASE}
                </span>{" "}
                to confirm.
              </p>
              <Input
                type="text"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoComplete="off"
                placeholder={CONFIRM_PHRASE}
              />
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={phrase !== CONFIRM_PHRASE || deleting}
                onClick={(e) => {
                  // Keep the dialog open while the async request runs (and on error).
                  e.preventDefault();
                  void handleDelete();
                }}
              >
                {deleting ? "Deleting…" : "Permanently delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardBody>
    </Card>
  );
}
