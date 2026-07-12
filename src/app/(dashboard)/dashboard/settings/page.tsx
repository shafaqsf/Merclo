"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import DeleteAccount from "./_components/DeleteAccount";

export default function SettingsPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [userError, setUserError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createBrowserSupabase();

    supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setUserError(error.message);
        } else {
          setEmail(data.user?.email ?? null);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setUserError(
          err instanceof Error ? err.message : "Failed to load account."
        );
      })
      .finally(() => {
        if (active) setLoadingUser(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleChangePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setPasswordError(error.message);
        return;
      }
      setPasswordSuccess("Password updated successfully.");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : "Failed to update password."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Settings
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Manage your profile, password, and account.
        </p>
      </header>

      {/* Profile */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold tracking-tight text-ink">
            Profile
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            The email address associated with your account.
          </p>
        </CardHeader>
        <CardBody>
          <Field label="Email" htmlFor="account-email">
            {loadingUser ? (
              <div className="h-11 w-full max-w-sm animate-pulse rounded-xl bg-surface-2" />
            ) : userError ? (
              <p className="text-sm text-danger" role="alert">
                {userError}
              </p>
            ) : (
              <div className="w-full max-w-sm rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm text-muted">
                {email ?? "—"}
              </div>
            )}
          </Field>
        </CardBody>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold tracking-tight text-ink">
            Change password
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Choose a new password of at least 8 characters.
          </p>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleChangePassword} className="space-y-5">
            <Field label="New password" htmlFor="new-password">
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="max-w-sm"
              />
            </Field>

            <Field label="Confirm password" htmlFor="confirm-password">
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="max-w-sm"
              />
            </Field>

            {passwordError ? (
              <p className="text-sm text-danger" role="alert">
                {passwordError}
              </p>
            ) : null}
            {passwordSuccess ? (
              <p
                className="text-sm text-[color:var(--success)]"
                role="status"
              >
                {passwordSuccess}
              </p>
            ) : null}

            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Saving…" : "Update password"}
            </Button>
          </form>
        </CardBody>
      </Card>

      {/* Danger zone */}
      <DeleteAccount />
    </div>
  );
}
