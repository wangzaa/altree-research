"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";

type Status = "idle" | "sending" | "sent";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    setError(null);
    setStatus("sending");
    try {
      const result = await authClient.signIn.magicLink({
        email,
        callbackURL: "/",
      });
      if (result.error) {
        setError(result.error.message ?? "Failed to send magic link");
        setStatus("idle");
        return;
      }
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setStatus("idle");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-neutral-900">Sign in</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Enter your email to receive a magic link.
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-neutral-700">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "sending"}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none disabled:bg-neutral-100"
              placeholder="you@example.com"
            />
          </label>

          <button
            type="submit"
            disabled={status === "sending" || email.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
          >
            {status === "sending" ? (
              <>
                <span
                  className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"
                  aria-hidden="true"
                />
                <span>Sending...</span>
              </>
            ) : (
              <span>Send magic link</span>
            )}
          </button>

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          {status === "sent" ? (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Check your terminal — the link was logged there in dev mode.
            </p>
          ) : null}
        </form>

        <p className="mt-6 text-xs text-neutral-500">
          Dev mode: the magic link is logged to the Next.js server console — copy
          it and paste into the browser.
        </p>
      </div>
    </main>
  );
}
