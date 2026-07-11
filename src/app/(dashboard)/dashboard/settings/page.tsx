"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
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
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
          Account settings
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Manage your profile, password, and account.
        </p>
      </div>

      {/* Profile */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h3 className="text-lg font-semibold tracking-tight text-neutral-900">
          Profile
        </h3>
        <p className="mt-1 text-sm text-neutral-500">
          The email address associated with your account.
        </p>

        <div className="mt-4">
          <label className="block text-sm font-medium text-neutral-700">
            Email
          </label>
          {loadingUser ? (
            <div className="mt-1 h-9 w-full max-w-sm animate-pulse rounded-lg bg-neutral-100" />
          ) : userError ? (
            <p className="mt-1 text-sm text-red-600" role="alert">
              {userError}
            </p>
          ) : (
            <input
              type="email"
              value={email ?? ""}
              readOnly
              className="mt-1 w-full max-w-sm rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600"
            />
          )}
        </div>
      </section>

      {/* Change password */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h3 className="text-lg font-semibold tracking-tight text-neutral-900">
          Change password
        </h3>
        <p className="mt-1 text-sm text-neutral-500">
          Choose a new password of at least 8 characters.
        </p>

        <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="new-password"
              className="block text-sm font-medium text-neutral-700"
            >
              New password
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="mt-1 w-full max-w-sm rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100"
            />
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="block text-sm font-medium text-neutral-700"
            >
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="mt-1 w-full max-w-sm rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100"
            />
          </div>

          {passwordError ? (
            <p className="text-sm text-red-600" role="alert">
              {passwordError}
            </p>
          ) : null}
          {passwordSuccess ? (
            <p className="text-sm text-green-600" role="status">
              {passwordSuccess}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Update password"}
          </button>
        </form>
      </section>

      {/* Danger zone */}
      <DeleteAccount />
    </div>
  );
}
